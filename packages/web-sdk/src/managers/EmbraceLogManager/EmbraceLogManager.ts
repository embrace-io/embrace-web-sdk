import type { Attributes, DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { Logger } from '@opentelemetry/api-logs';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';
import type {
  ExceptionHandlerType,
  LogExceptionOptions,
  LogManager,
  LogMessageOptions,
  LogSeverity,
} from '../../api-logs/manager/types.ts';
import type { VisibilityStateDocument } from '../../common/types.ts';
import {
  EMB_TYPES,
  KEY_EMB_ERROR_LOG_COUNT,
  KEY_EMB_EXCEPTION_CAUSE,
  KEY_EMB_EXCEPTION_HANDLING,
  KEY_EMB_EXCEPTION_NUMBER,
  KEY_EMB_JS_EXCEPTION_STACKTRACE,
  KEY_EMB_JS_FILE_BUNDLE_IDS,
  KEY_EMB_STATE,
  KEY_EMB_TYPE,
  KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT,
} from '../../constants/attributes.ts';
import { getIncrementedCount } from '../../utils/getIncrementedCount.ts';
import { getVisibilityState } from '../../utils/getVisibilityState.ts';
import { GLOBAL_CONFIG } from '../../utils/globalConfig.ts';
import type { NamespacedStorage } from '../../utils/NamespacedStorage/NamespacedStorage.ts';
import type { PerformanceManager } from '../../utils/PerformanceManager/types.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/types.ts';
import type { UserSessionManagerInternal } from '../EmbraceUserSessionManager/types.ts';
import type { EmbraceLogManagerArgs } from './types.ts';

const EMBRACE_EXCEPTION_NUMBER_STORAGE_KEY = 'embrace_exception_number';
/**
 * GLOBAL_CONFIG._EmbraceFileBundleIDs is populated at runtime when each file is loaded,
 * based on the contents injected by the embrace-web-cli.
 */
const getJSFileBundleIDs = () =>
  JSON.stringify(GLOBAL_CONFIG._EmbraceFileBundleIDs || {});

export class EmbraceLogManager implements LogManager {
  private readonly _diag: DiagLogger;
  private readonly _perf: PerformanceManager;
  private readonly _logger: Logger;
  private readonly _userSessionManager: UserSessionManagerInternal;
  private readonly _limitManager: LimitManagerInternal;
  private readonly _visibilityDoc: VisibilityStateDocument;
  private readonly _storage: NamespacedStorage;

  public constructor({
    diag: diagParam,
    perf,
    userSessionManager,
    limitManager,
    loggerProvider: globalLoggerProviderOverride,
    visibilityDoc,
    storage,
  }: EmbraceLogManagerArgs) {
    const loggerProvider = globalLoggerProviderOverride ?? logs;

    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceLogManager',
      });
    this._perf = perf;
    this._logger = loggerProvider.getLogger('embrace-web-sdk-logs');
    this._userSessionManager = userSessionManager;
    this._limitManager = limitManager;
    this._visibilityDoc = visibilityDoc;
    this._storage = storage;
  }

  private _validateAttributes(attributes: unknown): Attributes {
    if (Object.prototype.toString.call(attributes) !== '[object Object]') {
      this._diag.warn('attributes must be a plain object', attributes);
      return {};
    }
    return attributes as Attributes;
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
    const validAttrs = this._validateAttributes(attributes);

    if (!handled) {
      this._userSessionManager.incrSessionPartCountForKey(
        KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT,
      );
    }

    const type = error?.constructor?.name || typeof error;
    let errMessage = '';
    let errName = type;
    let errStack = '';
    let errCause = '';

    if (error instanceof Error) {
      errMessage = String(error.message || '').trim();
      errName = error.name || '';
      errStack = error.stack || '';
      errCause = error.cause ? 'present' : '';
    } else if (error && typeof error === 'object') {
      try {
        errMessage = JSON.stringify(error);
      } catch {
        errMessage = String(error).trim();
      }
    } else {
      errMessage = String(error).trim();
    }

    const limited = this._limitManager.limitException(errMessage, validAttrs);
    if (limited === 'dropped') {
      return;
    }

    this._logger.emit({
      timestamp,
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: limited.message,
      attributes: {
        ...limited.attributes,
        [KEY_EMB_TYPE]: EMB_TYPES.SystemException,
        [KEY_EMB_EXCEPTION_HANDLING]: EmbraceLogManager._exceptionHandlingType(
          handled,
          handler,
        ),
        [KEY_EMB_EXCEPTION_CAUSE]: errCause,
        [ATTR_EXCEPTION_TYPE]: type,
        ['exception.name']: errName,
        [ATTR_EXCEPTION_MESSAGE]: limited.message,
        [ATTR_EXCEPTION_STACKTRACE]: errStack,
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
    if (typeof message !== 'string' || !message.trim()) {
      this._diag.warn('Message must be a non-empty string');
      return;
    }

    if (!['info', 'warning', 'error'].includes(severity)) {
      this._diag.warn('Severity must be info, warning, or error');
      return;
    }

    const validAttrs = this._validateAttributes(attributes);

    if (severity === 'error') {
      this._userSessionManager.incrSessionPartCountForKey(
        KEY_EMB_ERROR_LOG_COUNT,
      );
    }

    let stack = '';
    if (severity !== 'info') {
      if (typeof stacktrace === 'string') {
        stack = stacktrace;
      } else if (includeStacktrace) {
        stack = new Error().stack || '';
      }
    }

    this._logMessage({
      message: message.trim(),
      severity,
      timestamp: this._perf.getNowMillis(),
      attributes: validAttrs,
      stack,
    });
  }

  private _logMessage({
    message,
    severity,
    timestamp,
    attributes = {},
    stack,
  }: {
    message: string;
    severity: LogSeverity;
    timestamp: number;
    attributes?: Attributes;
    stack?: string;
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
        ...(stack
          ? {
              [KEY_EMB_JS_EXCEPTION_STACKTRACE]: stack,
              [KEY_EMB_JS_FILE_BUNDLE_IDS]: getJSFileBundleIDs(),
            }
          : {}),
        [KEY_EMB_STATE]: getVisibilityState(this._visibilityDoc),
      },
    });
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
