import { diag } from '@opentelemetry/api';
import { createSafeProxy } from '../../../utils/index.ts';
import type { LogManager } from '../../manager/index.ts';
import { NoOpLogManager, ProxyLogManager } from '../../manager/index.ts';

/**
 * Public interface for LogAPI including SDK-internal methods.
 */
export interface LogAPIInstance extends LogManager {
  /** @internal SDK use only */
  setGlobalLogManager(logManager: LogManager): void;
  /** @internal SDK use only */
  getLogManager(): LogManager;
}

const NOOP_LOG_MANAGER = new NoOpLogManager();
const INTERNAL_METHODS = new Set(['setDelegate', 'getDelegate']);

export class LogAPI {
  private static _instance?: LogAPIInstance;

  public static getInstance(): LogAPIInstance {
    if (!LogAPI._instance) {
      const proxyManager = new ProxyLogManager();

      const safeManager = createSafeProxy(
        proxyManager,
        NOOP_LOG_MANAGER,
        diag.createComponentLogger({ namespace: 'LogAPI' }),
        INTERNAL_METHODS,
      );

      LogAPI._instance = Object.assign(safeManager, {
        setGlobalLogManager(logManager: LogManager): void {
          proxyManager.setDelegate(logManager);
        },
        getLogManager(): LogManager {
          return proxyManager;
        },
      }) as LogAPIInstance;
    }

    return LogAPI._instance;
  }

  public static resetInstance(): void {
    LogAPI._instance = undefined;
  }
}
