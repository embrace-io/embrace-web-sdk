import { diag } from '@opentelemetry/api';
import type { SpanSessionManagerInternal } from '../../../managers/EmbraceSpanSessionManager/types.ts';
import { createSafeProxy } from '../../../utils/index.ts';
import type { SpanSessionManager } from '../../manager/index.ts';
import {
  NoOpSpanSessionManager,
  ProxySpanSessionManager,
} from '../../manager/index.ts';

/**
 * Public interface for SessionAPI including SDK-internal methods.
 */
export interface SessionAPIInstance extends SpanSessionManager {
  /** @internal SDK use only */
  setGlobalSessionManager(sessionManager: SpanSessionManagerInternal): void;
  /** @internal SDK use only */
  getSpanSessionManager(): SpanSessionManagerInternal;
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
        setGlobalSessionManager(
          sessionManager: SpanSessionManagerInternal,
        ): void {
          proxyManager.setDelegate(sessionManager);
        },
        getSpanSessionManager(): SpanSessionManagerInternal {
          return proxyManager;
        },
      }) as SessionAPIInstance;
    }

    return SessionAPI._instance;
  }

  /** @internal For testing only. Resets the global singleton between tests. */
  public static resetInstance(): void {
    SessionAPI._instance = undefined;
  }
}
