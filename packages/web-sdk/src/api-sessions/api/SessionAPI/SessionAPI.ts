import { diag } from '@opentelemetry/api';
import type { UserSessionManagerInternal } from '../../../managers/EmbraceUserSessionManager/types.ts';
import { createSafeProxy } from '../../../utils/createSafeProxy/createSafeProxy.ts';
import { NoOpUserSessionManager } from '../../manager/NoOpUserSessionManager/NoOpUserSessionManager.ts';
import { ProxyUserSessionManager } from '../../manager/ProxyUserSessionManager/ProxyUserSessionManager.ts';
import type { UserSessionManager } from '../../manager/types.ts';

/**
 * Public interface for SessionAPI including SDK-internal methods.
 */
export interface SessionAPIInstance extends UserSessionManager {
  /** @internal SDK use only */
  setGlobalUserSessionManager(
    userSessionManager: UserSessionManagerInternal,
  ): void;
  /** @internal SDK use only */
  getUserSessionManager(): UserSessionManagerInternal;
}

const NOOP_USER_SESSION_MANAGER = new NoOpUserSessionManager();
const INTERNAL_METHODS = new Set(['setDelegate', 'getDelegate']);

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

      // Combine safe-wrapped manager methods with SDK-internal methods
      SessionAPI._instance = Object.assign(safeManager, {
        setGlobalUserSessionManager(
          userSessionManager: UserSessionManagerInternal,
        ): void {
          proxyManager.setDelegate(userSessionManager);
        },
        getUserSessionManager(): UserSessionManagerInternal {
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
