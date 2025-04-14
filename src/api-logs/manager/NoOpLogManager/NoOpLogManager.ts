import type { AttributeValue } from '@opentelemetry/api';
import type { LogManager, LogSeverity } from '../index.js';

export class NoOpLogManager implements LogManager {
  public logException(
    _error: Error,
    _handled: boolean,
    _attributes?: Record<string, AttributeValue | undefined>,
    _timestamp?: number
  ) {
    // no op
  }

  public message(
    _message: string,
    _level: LogSeverity,
    _attributes?: Record<string, AttributeValue | undefined>,
    _includeStacktrace?: boolean
  ) {
    // no op
  }
}
