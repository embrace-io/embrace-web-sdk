import { diag } from '@opentelemetry/api';
import type {
  LogExceptionOptions,
  LogManager,
  LogMessageOptions,
  LogSeverity,
} from '../index.ts';
import { NoOpLogManager } from '../NoOpLogManager/index.ts';

const NOOP_LOG_MANAGER = new NoOpLogManager();
const PROXY_DIAG = diag.createComponentLogger({
  namespace: 'ProxyLogManager',
});

export class ProxyLogManager implements LogManager {
  private _delegate?: LogManager;

  public getDelegate(): LogManager {
    if (!this._delegate) {
      PROXY_DIAG.debug('called before initSDK(); using no-op');
      return NOOP_LOG_MANAGER;
    }
    return this._delegate;
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
}
