import type {
  LogExceptionOptions,
  LogManager,
  LogMessageOptions,
  LogSeverity,
} from '../../manager/index.ts';
import { ProxyLogManager } from '../../manager/index.ts';
import type { LogAPIArgs } from './types.ts';

export class LogAPI implements LogManager {
  private static _instance?: LogAPI;
  private readonly _proxyLogManager;

  private constructor({ proxyLogManager }: LogAPIArgs) {
    this._proxyLogManager = proxyLogManager;
  }

  public static getInstance(): LogAPI {
    if (!LogAPI._instance) {
      LogAPI._instance = new LogAPI({
        proxyLogManager: new ProxyLogManager(),
      });
    }

    return LogAPI._instance;
  }

  public getLogManager: () => LogManager = () => {
    return this._proxyLogManager;
  };

  public setGlobalLogManager(logManager: LogManager): void {
    this._proxyLogManager.setDelegate(logManager);
  }

  public logException(error: unknown, options?: LogExceptionOptions) {
    this.getLogManager().logException(error, options);
  }

  public message(
    message: string,
    level: LogSeverity,
    options?: LogMessageOptions,
  ) {
    this.getLogManager().message(message, level, options);
  }
}
