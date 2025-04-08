import type { AttributeValue } from '@opentelemetry/api';
import type { LogManager, LogSeverity } from '../types.js';

export class NoOpLogManager implements LogManager {
  public message(
    _message: string,
    _level: LogSeverity,
    _attributes?: Record<string, AttributeValue | undefined>
  ) {
    // no op
  }
}
