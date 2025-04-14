import type { AttributeValue } from '@opentelemetry/api';
import type { LogManager, LogSeverity } from '../index.js';
import { NoOpLogManager } from '../NoOpLogManager/index.js';

const NOOP_LOG_MANAGER = new NoOpLogManager();

export class ProxyLogManager implements LogManager {
  private _delegate?: LogManager;

  public getDelegate(): LogManager {
    return this._delegate ?? NOOP_LOG_MANAGER;
  }

  public setDelegate(delegate: LogManager) {
    this._delegate = delegate;
  }

  public logException(
    error: Error,
    handled: boolean,
    attributes?: Record<string, AttributeValue | undefined>,
    timestamp?: number
  ) {
    this.getDelegate().logException(error, handled, attributes, timestamp);
  }

  public message(
    message: string,
    level: LogSeverity,
    attributes?: Record<string, AttributeValue | undefined>,
    includeStacktrace?: boolean
  ) {
    this.getDelegate().message(message, level, attributes, includeStacktrace);
  }
}
