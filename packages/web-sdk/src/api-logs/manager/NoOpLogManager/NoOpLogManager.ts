import type {
  LogExceptionOptions,
  LogManager,
  LogMessageOptions,
  LogSeverity,
} from '../types.ts';

export class NoOpLogManager implements LogManager {
  public logException(_error: unknown, _options?: LogExceptionOptions) {
    // no op
  }

  public message(
    _message: string,
    _level: LogSeverity,
    _options?: LogMessageOptions,
  ) {
    // no op
  }
}
