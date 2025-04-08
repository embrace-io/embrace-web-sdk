import type { AttributeValue } from '@opentelemetry/api';
import { NoOpLogManager } from '../NoOpLogManager/index.js';
import type { LogManager, LogSeverity } from '../types.js';

const NOOP_SPAN_SESSION_MANAGER = new NoOpLogManager();

export class ProxyLogManager implements LogManager {
  private _delegate?: LogManager;

  public getDelegate(): LogManager {
    return this._delegate ?? NOOP_SPAN_SESSION_MANAGER;
  }

  public setDelegate(delegate: LogManager) {
    this._delegate = delegate;
  }

  public message(
    message: string,
    level: LogSeverity,
    attributes?: Record<string, AttributeValue | undefined>
  ) {
    this.getDelegate().message(message, level, attributes);
  }
}
