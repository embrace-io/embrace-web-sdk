import type { AttributeValue } from '@opentelemetry/api';
import type { LogSeverity } from '../../manager/index.js';
import { type LogManager, ProxyLogManager } from '../../manager/index.js';
import type { LogAPIArgs } from './types.js';

export class LogAPI implements LogManager {
  private static _instance?: LogAPI;
  private readonly _proxyLogManager;

  private constructor({ proxyLogManager }: LogAPIArgs) {
    this._proxyLogManager = proxyLogManager;
  }

  public static getInstance(): LogAPI {
    if (!this._instance) {
      this._instance = new LogAPI({
        proxyLogManager: new ProxyLogManager(),
      });
    }

    return this._instance;
  }

  public getLogManager: () => LogManager = () => {
    return this._proxyLogManager;
  };

  public setGlobalLogManager(logManager: LogManager): void {
    this._proxyLogManager.setDelegate(logManager);
  }

  public logException(
    timestamp: number,
    error: Error,
    handled: boolean,
    attributes?: Record<string, AttributeValue | undefined>
  ) {
    this.getLogManager().logException(timestamp, error, handled, attributes);
  }

  public message(
    message: string,
    level: LogSeverity,
    attributes?: Record<string, AttributeValue | undefined>,
    includeStacktrace?: boolean
  ) {
    this.getLogManager().message(message, level, attributes, includeStacktrace);
  }
}
