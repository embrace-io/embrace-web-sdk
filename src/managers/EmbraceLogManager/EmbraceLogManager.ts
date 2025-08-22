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
import {
  EMB_TYPES,
  KEY_EMB_EXCEPTION_HANDLING,
  KEY_EMB_JS_EXCEPTION_STACKTRACE,
  KEY_EMB_TYPE,
} from '../../constants/index.js';
import type { PerformanceManager } from '../../utils/index.js';
import { GLOBAL_CONFIG, OTelPerformanceManager } from '../../utils/index.js';
import type { EmbraceLogManagerArgs } from './types.js';
import type {
  LogExceptionOptions,
  LogMessageOptions,
} from '../../api-logs/manager/index.js';
import type { SpanSessionManagerInternal } from '../EmbraceSpanSessionManager/index.js';
import {
  KEY_EMB_ERROR_LOG_COUNT,
  KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT,
  KEY_EMB_WEB_SYMBOL_FILE_IDS,
} from '../../constants/attributes.js';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.js';

export class EmbraceLogManager implements LogManager {
  private readonly _diag: DiagLogger;
  private readonly _perf: PerformanceManager;
  private readonly _logger: Logger;
  private readonly _spanSessionManager: SpanSessionManagerInternal;
  private readonly _limitManager: LimitManagerInternal;

  public constructor({
    diag: diagParam,
    perf,
    spanSessionManager,
    limitManager,
    loggerProvider: globalLoggerProviderOverride,
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
  }

  private static _logSeverityToSeverityNumber(
    severity: LogSeverity
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
    }: LogExceptionOptions = {}
  ) {
    if (!error) {
      error = new Error('logException received an undefined error');
    }

    // real user input may be null but TS doesn't know that
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (attributes == null || typeof attributes !== 'object') {
      this._diag.warn('attributes must be a non-null object', attributes);
      attributes = {};
    }

    if (!handled) {
      this._spanSessionManager.incrSessionCountForKey(
        KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT
      );
    }

    const normalizedError = EmbraceLogManager._normalizeErrorData(error);

    const limitedException = this._limitManager.limitException(
      normalizedError.message,
      attributes
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
        [KEY_EMB_EXCEPTION_HANDLING]: handled ? 'HANDLED' : 'UNHANDLED',
        [ATTR_EXCEPTION_TYPE]: normalizedError.type,
        ['exception.name']: normalizedError.name,
        [ATTR_EXCEPTION_MESSAGE]: limitedException.message,
        [ATTR_EXCEPTION_STACKTRACE]: normalizedError.stack,
        [KEY_EMB_WEB_SYMBOL_FILE_IDS]: GLOBAL_CONFIG._EmbraceWebSymbolFileIDs,
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
    }: LogMessageOptions = {}
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
      if (stacktrace) {
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
      attributes
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
              [KEY_EMB_WEB_SYMBOL_FILE_IDS]:
                GLOBAL_CONFIG._EmbraceWebSymbolFileIDs,
            }
          : {}),
      },
    });
  }

  private static _normalizeErrorData(error: unknown): {
    message: string;
    type: string;
    name: string;
    stack: string; // 'stack' not 'stacktrace' here to match the standard Error.stack property name
  } {
    if (error instanceof Error) {
      return {
        message: typeof error.message === 'string' ? error.message.trim() : '',
        type: error.constructor.name,
        name: error.name,
        stack: error.stack || '',
      };
    }

    // For non-Error types, generate a new stack trace
    const userCallStack = new Error().stack || '';

    if (typeof error === 'string') {
      return {
        message: error.trim(),
        type: 'String',
        name: 'String',
        stack: userCallStack,
      };
    }

    if (error && typeof error === 'object') {
      let message = '';
      try {
        message = JSON.stringify(error);
      } catch {
        message = '[unable to serialize error]';
      }

      return {
        message,
        type: error.constructor.name,
        name: error.constructor.name,
        stack: userCallStack,
      };
    }

    return {
      message: String(error).trim(),
      type: typeof error,
      name: typeof error,
      stack: userCallStack,
    };
  }
}
