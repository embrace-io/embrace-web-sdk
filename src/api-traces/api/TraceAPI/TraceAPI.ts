import type { Context } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import { createSafeProxy } from '../../../utils/index.js';
import type { TraceManager } from '../../manager/index.js';
import { NoOpTraceManager, ProxyTraceManager } from '../../manager/index.js';
import type { ExtendedSpan, ExtendedSpanOptions } from './types.js';

/**
 * Public interface for TraceAPI including SDK-internal methods.
 */
export interface TraceAPIInstance extends TraceManager {
  /** @internal SDK use only */
  setGlobalTraceManager(traceManager: TraceManager): void;
  /** @internal SDK use only */
  getTraceManager(): TraceManager;
}

const NOOP_TRACE_MANAGER = new NoOpTraceManager();
const INTERNAL_METHODS = new Set(['setDelegate', 'getDelegate']);

export class TraceAPI {
  private static _instance?: TraceAPIInstance;

  public static getInstance(): TraceAPIInstance {
    if (!TraceAPI._instance) {
      const proxyManager = new ProxyTraceManager();

      const safeManager = createSafeProxy(
        proxyManager,
        NOOP_TRACE_MANAGER,
        diag.createComponentLogger({ namespace: 'TraceAPI' }),
        INTERNAL_METHODS,
      );

      TraceAPI._instance = Object.assign(safeManager, {
        setGlobalTraceManager(traceManager: TraceManager): void {
          proxyManager.setDelegate(traceManager);
        },
        getTraceManager(): TraceManager {
          return proxyManager;
        },
      }) as TraceAPIInstance;
    }

    return TraceAPI._instance;
  }

  public static resetInstance(): void {
    TraceAPI._instance = undefined;
  }
}

// Re-export types for backward compatibility
export type { Context, ExtendedSpan, ExtendedSpanOptions, TraceManager };
