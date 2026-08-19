import type {
  LogExceptionOptions,
  LogManager,
  LogMessageOptions,
  LogSeverity,
} from '../index.ts';
import { NoOpLogManager } from '../NoOpLogManager/index.ts';

const NOOP_LOG_MANAGER = new NoOpLogManager();

export class ProxyLogManager implements LogManager {
  private _delegate?: LogManager;

  public getDelegate(): LogManager {
    return this._delegate ?? NOOP_LOG_MANAGER;
  }

  public setDelegate(delegate: LogManager) {
    this._delegate = delegate;
  }

  public logException(error: unknown, options?: LogExceptionOptions) {
    this.getDelegate().logException(error, options);
  }

  public message(
    message: string,
    level: LogSeverity,
    options?: LogMessageOptions,
  ) {
    this.getDelegate().message(message, level, options);
  }

  public flush(): Promise<void> {
    return this.getDelegate().flush();
  }
}
