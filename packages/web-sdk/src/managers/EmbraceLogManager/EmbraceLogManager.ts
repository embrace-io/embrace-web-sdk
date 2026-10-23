import type { Attributes, DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { Logger } from '@opentelemetry/api-logs';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';
import type { LogManager, LogSeverity } from '../../api-logs/index.ts';
import type {
  LogExceptionOptions,
  LogMessageOptions,
} from '../../api-logs/manager/index.ts';
import type { ExceptionHandlerType } from '../../api-logs/manager/types.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import {
  KEY_EMB_ERROR_LOG_COUNT,
  KEY_EMB_EXCEPTION_CAUSE,
  KEY_EMB_JS_FILE_BUNDLE_IDS,
  KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT,
} from '../../constants/attributes.ts';
import {
  EMB_TYPES,
  KEY_EMB_EXCEPTION_HANDLING,
  KEY_EMB_EXCEPTION_NUMBER,
  KEY_EMB_JS_EXCEPTION_STACKTRACE,
  KEY_EMB_STATE,
  KEY_EMB_TYPE,
} from '../../constants/index.ts';
import type {
  NamespacedStorage,
  PerformanceManager,
} from '../../utils/index.ts';
import {
  GLOBAL_CONFIG,
  getIncrementedCount,
  getVisibilityState,
} from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';
import type { UserSessionManagerInternal } from '../EmbraceUserSessionManager/index.ts';
import { EXCEPTION_EVENT_NAME, LOG_EVENT_NAME } from './constants.ts';
import type { EmbraceLogManagerArgs } from './types.ts';

const EMBRACE_EXCEPTION_NUMBER_STORAGE_KEY = 'embrace_exception_number';
/**
 * GLOBAL_CONFIG._EmbraceFileBundleIDs is populated at runtime when each file is loaded,
 * based on the contents injected by the embrace-web-cli.
 */
const getJSFileBundleIDs = () =>
  JSON.stringify(GLOBAL_CONFIG._EmbraceFileBundleIDs || {});

interface ErrorDescription {
  type: string;
  name: string;
  message: string;
  stack: string;
  cause: string;
}

// The tag check also matches errors from other realms (iframes), which fail instanceof.
// Error.isError would do this but is not Baseline Widely Available.
const isError = (value: unknown): value is Error => {
  switch (Object.prototype.toString.call(value)) {
    case '[object Error]':
    case '[object DOMException]':
      return true;
    default:
      return value instanceof Error;
  }
};

const stringifyObject = (value: object): string => {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    // Circular references, BigInt values or a throwing toJSON.
  }
  // '{}' means no enumerable fields (e.g. a Response), so it says nothing.
  if (json && json !== '{}') {
    return json;
  }
  try {
    return String(value).trim();
  } catch {
    // No callable toString, e.g. Object.create(null).
    return Object.prototype.toString.call(value);
  }
};

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

    const {
      type,
      name: errName,
      message: errMessage,
      stack: errStack,
      cause: errCause,
    } = this._describeError(error);

    const limited = this._limitManager.limitException(errMessage, validAttrs);
    if (limited === 'dropped') {
      return;
    }

    this._logger.emit({
      eventName: EXCEPTION_EVENT_NAME,
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

  // Any value can be thrown or rejected, and its getters, toJSON or toString can throw.
  private _describeError(error: unknown): ErrorDescription {
    try {
      const constructorName: unknown = error?.constructor?.name;
      const type =
        typeof constructorName === 'string' && constructorName
          ? constructorName
          : typeof error;

      if (isError(error)) {
        return {
          type,
          name: typeof error.name === 'string' ? error.name : '',
          message: String(error.message || '').trim(),
          stack: typeof error.stack === 'string' ? error.stack : '',
          cause: error.cause ? 'present' : '',
        };
      }

      return {
        type,
        name: type,
        message:
          error && typeof error === 'object'
            ? stringifyObject(error)
            : String(error).trim(),
        stack: '',
        cause: '',
      };
    } catch (e) {
      this._diag.warn('failed to read exception value', e);
      return {
        type: typeof error,
        name: typeof error,
        message: '',
        stack: '',
        cause: '',
      };
    }
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
      eventName: LOG_EVENT_NAME,
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
