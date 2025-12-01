import type { HrTime } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { createSafeProxy } from '../../../utils/index.js';
import type {
  PropertyOptions,
  ReasonSessionEnded,
  SpanSessionManager,
  StartSessionOptions,
} from '../../manager/index.js';
import {
  NoOpSpanSessionManager,
  ProxySpanSessionManager,
} from '../../manager/index.js';

/**
 * Public interface for SessionAPI including SDK-internal methods.
 */
export interface SessionAPIInstance extends SpanSessionManager {
  /** @internal SDK use only */
  setGlobalSessionManager(sessionManager: SpanSessionManager): void;
  /** @internal SDK use only */
  getSpanSessionManager(): SpanSessionManager;
}

const NOOP_SPAN_SESSION_MANAGER = new NoOpSpanSessionManager();
const INTERNAL_METHODS = new Set(['setDelegate', 'getDelegate']);

export class SessionAPI {
  private static _instance?: SessionAPIInstance;

  public static getInstance(): SessionAPIInstance {
    if (!SessionAPI._instance) {
      const proxyManager = new ProxySpanSessionManager();

      const safeManager = createSafeProxy(
        proxyManager,
        NOOP_SPAN_SESSION_MANAGER,
        diag.createComponentLogger({ namespace: 'SessionAPI' }),
        INTERNAL_METHODS,
      );

      // Combine safe-wrapped manager methods with SDK-internal methods
      SessionAPI._instance = Object.assign(safeManager, {
        setGlobalSessionManager(sessionManager: SpanSessionManager): void {
          proxyManager.setDelegate(sessionManager);
        },
        getSpanSessionManager(): SpanSessionManager {
          return proxyManager;
        },
      }) as SessionAPIInstance;
    }

    return SessionAPI._instance;
  }

  // Static method to reset instance for testing
  public static resetInstance(): void {
    SessionAPI._instance = undefined;
  }
}

// Re-export types for backward compatibility
export type {
  HrTime,
  PropertyOptions,
  ReadableSpan,
  ReasonSessionEnded,
  SpanSessionManager,
  StartSessionOptions,
};
