import type {
  LogExceptionOptions,
  LogManager,
  LogMessageOptions,
  LogSeverity,
} from '../index.js';

export class NoOpLogManager implements LogManager {
  public logException(_error: Error, _options?: LogExceptionOptions) {
    // no op
  }

  public message(
    _message: string,
    _level: LogSeverity,
    _options?: LogMessageOptions
  ) {
    // no op
  }
}
