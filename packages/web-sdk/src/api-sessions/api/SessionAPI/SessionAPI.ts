import { diag } from '@opentelemetry/api';
import type { UserSessionManagerInternal } from '../../../managers/EmbraceUserSessionManager/types.ts';
import { createSafeProxy } from '../../../utils/index.ts';
import type { UserSessionManager } from '../../manager/index.ts';
import {
  NoOpUserSessionManager,
  ProxyUserSessionManager,
} from '../../manager/index.ts';

/**
 * SessionAPI singleton surface.
 *
 * Public methods are inherited from {@link UserSessionManager} via the
 * prototype chain (a `createSafeProxy`-wrapped {@link ProxyUserSessionManager}).
 * The SDK-internal methods below are added as own properties so they bypass
 * the safe-proxy wrap; they are tagged `@internal` because user code should
 * not call them and their names and signatures may change without a major
 * version bump.
 */
export interface SessionAPIInstance extends UserSessionManager {
  /** @internal SDK use only. */
  setGlobalUserSessionManager(
    userSessionManager: UserSessionManagerInternal,
  ): void;
  /** @internal SDK use only. */
  getUserSessionManager(): UserSessionManagerInternal;
}

const NOOP_USER_SESSION_MANAGER = new NoOpUserSessionManager();

export class SessionAPI {
  private static _instance?: SessionAPIInstance;

  public static getInstance(): SessionAPIInstance {
    if (!SessionAPI._instance) {
      const proxyUserSessionManager = new ProxyUserSessionManager();

      const safeUserSessionManager = createSafeProxy(
        proxyUserSessionManager,
        NOOP_USER_SESSION_MANAGER,
        diag.createComponentLogger({ namespace: 'SessionAPI' }),
      );

      // Compose internals onto an object whose prototype is the safe-wrapped
      // proxy. Public methods resolve via prototype lookup and go through the
      // safe-proxy's error-wrap; the @internal methods are own properties and
      // bypass the wrap entirely. This avoids needing a stringly-typed
      // exclusion set on the proxy: the proxy never sees the internals.
      const instance = Object.create(
        safeUserSessionManager,
      ) as SessionAPIInstance;
      instance.setGlobalUserSessionManager = (
        userSessionManager: UserSessionManagerInternal,
      ): void => {
        proxyUserSessionManager.setUserSessionManager(userSessionManager);
      };
      instance.getUserSessionManager = (): UserSessionManagerInternal =>
        proxyUserSessionManager.getUserSessionManager();

      SessionAPI._instance = instance;
    }

    return SessionAPI._instance;
  }

  /** @internal For testing only. Resets the global singleton between tests. */
  public static resetInstance(): void {
    SessionAPI._instance = undefined;
  }
}
