import { Logger, SeverityNumber } from '@opentelemetry/api-logs';
import { getNowMillis } from './getNowHRTime/getNowHRTime.js';
import {
  EMB_TYPES,
  KEY_EMB_TYPE,
  KEY_JS_EXCEPTION_STACKTRACE,
} from '../constants/index.js';
import { AttributeValue } from '@opentelemetry/api';

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

// TODO, is this enough to expose as a helper or should we have our own global API for logs? One downside here is
// requiring the caller to supply their own Logger
export function logMessage(
  logger: Logger,
  message: string,
  severity: LogSeverity,
  timestamp: number = getNowMillis(),
  properties: Record<string, AttributeValue | undefined> = {},
  stackTrace?: string
) {
  logger.emit({
    timestamp,
    severityNumber: logSeverityToSeverityNumber(severity),
    severityText: severity.toUpperCase(),
    body: message,
    attributes: {
      ...properties,
      [KEY_EMB_TYPE]: EMB_TYPES.SystemLog,
      // TODO, by default if no stack trace is applied we should generate one for warning + error level logs with
      //  frames from the Embrace SDK itself removed
      ...(stackTrace
        ? {
            [KEY_JS_EXCEPTION_STACKTRACE]: stackTrace,
          }
        : {}),
    },
  });
}
