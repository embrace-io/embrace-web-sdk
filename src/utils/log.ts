import type { AttributeValue } from '@opentelemetry/api';
import type { Logger } from '@opentelemetry/api-logs';
import { SeverityNumber } from '@opentelemetry/api-logs';
import {
  EMB_TYPES,
  KEY_EMB_JS_EXCEPTION_STACKTRACE,
  KEY_EMB_TYPE
} from '../constants/index.js';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE
} from '@opentelemetry/semantic-conventions';
import { KEY_EMB_EXCEPTION_HANDLING } from '../constants/attributes.js';

type LogSeverity = 'info' | 'warning' | 'error';

const logSeverityToSeverityNumber = (severity: LogSeverity): SeverityNumber => {
  switch (severity) {
    case 'info':
      return SeverityNumber.INFO;
    case 'warning':
      return SeverityNumber.WARN;
    default:
      return SeverityNumber.ERROR;
  }
};

// TODO, expose a public API on top of this for logs? One thing to consider for the public interface is not
// requiring the caller to supply their own Logger
export const logMessage = ({
  logger,
  message,
  severity,
  timestamp,
  attributes = {},
  stackTrace
}: {
  logger: Logger;
  message: string;
  severity: LogSeverity;
  timestamp: number;
  attributes?: Record<string, AttributeValue | undefined>;
  stackTrace?: string;
}) => {
  logger.emit({
    timestamp,
    severityNumber: logSeverityToSeverityNumber(severity),
    severityText: severity.toUpperCase(),
    body: message,
    attributes: {
      ...attributes,
      [KEY_EMB_TYPE]: EMB_TYPES.SystemLog, // TODO, for the public interface by default if no stack trace is applied we should generate one for warning +
      //  error level logs with frames from the Embrace SDK itself removed
      ...(stackTrace
        ? {
            [KEY_EMB_JS_EXCEPTION_STACKTRACE]: stackTrace
          }
        : {})
    }
  });
};

export const logException = ({
  logger,
  timestamp,
  error,
  handled,
  attributes = {}
}: {
  logger: Logger;
  timestamp: number;
  error: Error;
  handled: boolean;
  attributes?: Record<string, AttributeValue | undefined>;
}) => {
  logger.emit({
    timestamp,
    severityNumber: SeverityNumber.ERROR,
    severityText: 'ERROR',
    body: error.message || '',
    attributes: {
      ...attributes,
      [KEY_EMB_TYPE]: EMB_TYPES.SystemException,
      [KEY_EMB_EXCEPTION_HANDLING]: handled ? 'HANDLED' : 'UNHANDLED',
      [ATTR_EXCEPTION_TYPE]: error.constructor.name,
      ['exception.name']: error.name,
      [ATTR_EXCEPTION_MESSAGE]: error.message,
      [ATTR_EXCEPTION_STACKTRACE]: error.stack
    }
  });
};
