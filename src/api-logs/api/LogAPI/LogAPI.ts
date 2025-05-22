import type {
  LogExceptionOptions,
  LogMessageOptions,
  LogSeverity,
} from '../../manager/index.js';
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

  public logException(error: Error, options?: LogExceptionOptions) {
    this.getLogManager().logException(error, options);
  }

  public message(
    message: string,
    level: LogSeverity,
    options?: LogMessageOptions
  ) {
    this.getLogManager().message(message, level, options);
  }
}
