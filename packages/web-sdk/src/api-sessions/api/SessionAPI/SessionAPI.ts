import { diag } from '@opentelemetry/api';
import type { UserSessionLifecycleManager } from '../../../managers/EmbraceUserSessionManager/index.ts';
import { createSafeProxy } from '../../../utils/index.ts';
import type {
  SessionPartManager,
  UserSessionManager,
} from '../../manager/index.ts';
import {
  NoOpUserSessionManager,
  ProxyUserSessionManager,
} from '../../manager/index.ts';

/**
 * Public interface for SessionAPI including SDK-internal wiring methods.
 * The session part manager is exposed via {@link getSessionPartManager} for
 * SDK-internal callers (processors, storage) that need to end parts, snapshot
 * spans, or read the live part span. The `session` singleton itself does not
 * expose part-level operations; consumers use the returned manager directly.
 */
export interface SessionAPIInstance extends UserSessionManager {
  /** @internal SDK use only */
  setGlobalManagers(
    sessionPartManager: SessionPartManager,
    userSessionLifecycleManager?: UserSessionLifecycleManager,
  ): void;
  /** @internal SDK use only */
  getLifecycleManager(): UserSessionLifecycleManager;
  /** @internal SDK use only - for instrumentations that need part-level access */
  getSessionPartManager(): SessionPartManager;
}

const NOOP_USER_SESSION_MANAGER = new NoOpUserSessionManager();
const INTERNAL_METHODS = new Set([
  'setDelegates',
  'getPartDelegate',
  'getLifecycleDelegate',
  'setGlobalManagers',
  'getLifecycleManager',
  'getSessionPartManager',
]);

export class SessionAPI {
  private static _instance?: SessionAPIInstance;

  public static getInstance(): SessionAPIInstance {
    if (!SessionAPI._instance) {
      const proxyManager = new ProxyUserSessionManager();

      const safeManager = createSafeProxy(
        proxyManager,
        NOOP_USER_SESSION_MANAGER,
        diag.createComponentLogger({ namespace: 'SessionAPI' }),
        INTERNAL_METHODS,
      );

      SessionAPI._instance = Object.assign(safeManager, {
        setGlobalManagers(
          sessionPartManager: SessionPartManager,
          userSessionLifecycleManager?: UserSessionLifecycleManager,
        ): void {
          proxyManager.setDelegates(
            sessionPartManager,
            userSessionLifecycleManager,
          );
        },
        getLifecycleManager(): UserSessionLifecycleManager {
          return proxyManager.getLifecycleDelegate();
        },
        getSessionPartManager(): SessionPartManager {
          return proxyManager.getPartDelegate();
        },
      });
    }

    return SessionAPI._instance;
  }

  /** @internal For testing only. Resets the global singleton between tests. */
  public static resetInstance(): void {
    SessionAPI._instance = undefined;
  }
}
