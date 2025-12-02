import type { AttributeValue, DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { Logger } from '@opentelemetry/api-logs';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';
import type { LogManager, LogSeverity } from '../../api-logs/index.js';
import type {
  LogExceptionOptions,
  LogMessageOptions,
} from '../../api-logs/manager/index.js';
import type { ExceptionHandlerType } from '../../api-logs/manager/types';
import type { VisibilityStateDocument } from '../../common/index.js';
import {
  KEY_EMB_ERROR_LOG_COUNT,
  KEY_EMB_EXCEPTION_CAUSE,
  KEY_EMB_JS_FILE_BUNDLE_IDS,
  KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT,
} from '../../constants/attributes.js';
import {
  EMB_TYPES,
  KEY_EMB_EXCEPTION_HANDLING,
  KEY_EMB_EXCEPTION_NUMBER,
  KEY_EMB_JS_EXCEPTION_STACKTRACE,
  KEY_EMB_STATE,
  KEY_EMB_TYPE,
} from '../../constants/index.js';
import type { PerformanceManager } from '../../utils/index.js';
import {
  GLOBAL_CONFIG,
  getIncrementedCount,
  getVisibilityState,
  OTelPerformanceManager,
} from '../../utils/index.js';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.js';
import type { SpanSessionManagerInternal } from '../EmbraceSpanSessionManager/index.js';
import type { EmbraceLogManagerArgs } from './types.js';

const EMBRACE_EXCEPTION_NUMBER_STORAGE_KEY = 'embrace_exception_number';
/**
 * GLOBAL_CONFIG._EmbraceFileBundleIDs is populated on run time when each file is loaded,
 * based on the contents that were injected by the embrace-web-cli.
 */
const getJSFileBundleIDs = () =>
  JSON.stringify(GLOBAL_CONFIG._EmbraceFileBundleIDs || {});

export class EmbraceLogManager implements LogManager {
  private readonly _diag: DiagLogger;
  private readonly _perf: PerformanceManager;
  private readonly _logger: Logger;
  private readonly _spanSessionManager: SpanSessionManagerInternal;
  private readonly _limitManager: LimitManagerInternal;
  private readonly _visibilityDoc: VisibilityStateDocument;
  private readonly _storage: Storage;

  public constructor({
    diag: diagParam,
    perf,
    spanSessionManager,
    limitManager,
    loggerProvider: globalLoggerProviderOverride,
    visibilityDoc = window.document,
    storage = window.localStorage,
  }: EmbraceLogManagerArgs) {
    const loggerProvider = globalLoggerProviderOverride ?? logs;

    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceLogManager',
      });
    this._perf = perf ?? new OTelPerformanceManager();
    this._logger = loggerProvider.getLogger('embrace-web-sdk-logs');
    this._spanSessionManager = spanSessionManager;
    this._limitManager = limitManager;
    this._visibilityDoc = visibilityDoc;
    this._storage = storage;
  }

  private static _logSeverityToSeverityNumber(
    severity: LogSeverity,
  ): SeverityNumber {
    switch (severity) {
      case 'info':
        return SeverityNumber.INFO;
      case 'warning':
        return SeverityNumber.WARN;
      default:
        return SeverityNumber.ERROR;
    }
  }

  public logException(
    error: unknown,
    {
      handled = true,
      attributes = {},
      timestamp = this._perf.getNowMillis(),
      handler = 'manual',
    }: LogExceptionOptions = {},
  ) {
    if (attributes == null || typeof attributes !== 'object') {
      this._diag.warn('attributes must be a non-null object', attributes);
      attributes = {};
    }

    if (!handled) {
      this._spanSessionManager.incrSessionCountForKey(
        KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT,
      );
    }

    const normalizedError = EmbraceLogManager._normalizeErrorData(error);

    const limitedException = this._limitManager.limitException(
      normalizedError.message,
      attributes,
    );

    if (limitedException === 'dropped') {
      return;
    }

    this._logger.emit({
      timestamp,
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: limitedException.message,
      attributes: {
        ...limitedException.attributes,
        [KEY_EMB_TYPE]: EMB_TYPES.SystemException,
        [KEY_EMB_EXCEPTION_HANDLING]: EmbraceLogManager._exceptionHandlingType(
          handled,
          handler,
        ),
        [KEY_EMB_EXCEPTION_CAUSE]: normalizedError.cause,
        [ATTR_EXCEPTION_TYPE]: normalizedError.type,
        ['exception.name']: normalizedError.name,
        [ATTR_EXCEPTION_MESSAGE]: limitedException.message,
        [ATTR_EXCEPTION_STACKTRACE]: normalizedError.stack,
        [KEY_EMB_JS_FILE_BUNDLE_IDS]: getJSFileBundleIDs(),
        [KEY_EMB_STATE]: getVisibilityState(this._visibilityDoc),
        [KEY_EMB_EXCEPTION_NUMBER]: getIncrementedCount(
          this._storage,
          EMBRACE_EXCEPTION_NUMBER_STORAGE_KEY,
          this._diag,
        ),
      },
    });
  }

  public message(
    message: string,
    severity: LogSeverity,
    {
      attributes = {},
      includeStacktrace = true,
      stacktrace,
    }: LogMessageOptions = {},
  ) {
    if (!message || typeof message !== 'string') {
      this._diag.warn('Message must be a string');
      return;
    }

    if (severity === 'error') {
      this._spanSessionManager.incrSessionCountForKey(KEY_EMB_ERROR_LOG_COUNT);
    }

    let stacktraceString = '';
    if (severity !== 'info') {
      if (typeof stacktrace === 'string') {
        stacktraceString = stacktrace;
      } else if (includeStacktrace) {
        stacktraceString = new Error().stack || '';
      }
    }

    this._logMessage({
      message: message.trim(),
      severity,
      timestamp: this._perf.getNowMillis(),
      attributes,
      stacktrace: stacktraceString,
    });
  }

  private _logMessage({
    message,
    severity,
    timestamp,
    attributes = {},
    stacktrace,
  }: {
    message: string;
    severity: LogSeverity;
    timestamp: number;
    attributes?: Record<string, AttributeValue | undefined>;
    stacktrace?: string;
  }) {
    const limitedLog = this._limitManager.limitLog(
      message,
      severity,
      attributes,
    );

    if (limitedLog === 'dropped') {
      return;
    }

    this._logger.emit({
      timestamp,
      severityNumber: EmbraceLogManager._logSeverityToSeverityNumber(severity),
      severityText: severity.toUpperCase(),
      body: limitedLog.message,
      attributes: {
        ...limitedLog.attributes,
        [KEY_EMB_TYPE]: EMB_TYPES.SystemLog,
        ...(stacktrace
          ? {
              [KEY_EMB_JS_EXCEPTION_STACKTRACE]: stacktrace,
              [KEY_EMB_JS_FILE_BUNDLE_IDS]: getJSFileBundleIDs(),
            }
          : {}),
        [KEY_EMB_STATE]: getVisibilityState(this._visibilityDoc),
      },
    });
  }

  private static _normalizeErrorData(error: unknown): {
    message: string;
    type: string;
    name: string;
    stack: string; // 'stack' not 'stacktrace' here to match the standard Error.stack property name
    cause: string;
  } {
    const constructorName = EmbraceLogManager._getConstructorName(error);

    if (error instanceof Error) {
      return {
        message: String(error.message || '').trim(),
        type: constructorName,
        name: error.name || '',
        stack: error.stack || '',
        cause: error.cause ? 'present' : '',
      };
    }

    let message = '';
    if (typeof error === 'object') {
      try {
        message = JSON.stringify(error);
      } catch {
        message = String(error).trim();
      }
    } else {
      message = String(error).trim();
    }

    return {
      message,
      type: constructorName,
      name: constructorName,
      stack: '',
      cause: '',
    };
  }

  /**
   * Safely extracts constructor name from an object.
   * Handles edge cases like Object.create(null) or missing constructor.
   */
  private static _getConstructorName(obj: unknown): string {
    try {
      if (obj?.constructor?.name) {
        return obj.constructor.name;
      }
    } catch {
      // Accessing constructor can throw in some edge cases
    }
    return typeof obj;
  }

  private static _exceptionHandlingType(
    handled: boolean,
    handler: ExceptionHandlerType,
  ): string {
    if (handled) {
      return 'handled';
    }

    if (handler === 'global_exception') {
      return 'unhandled_error';
    }

    if (handler === 'promise_rejection') {
      return 'unhandled_rejection';
    }

    return 'unhandled';
  }
}
