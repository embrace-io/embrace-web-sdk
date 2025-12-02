import { diag } from '@opentelemetry/api';
import { createSafeProxy } from '../../../utils/index.js';
import type { UserManager } from '../../manager/index.js';
import { NoOpUserManager, ProxyUserManager } from '../../manager/index.js';

/**
 * Public interface for UserAPI including SDK-internal methods.
 */
export interface UserAPIInstance extends UserManager {
  /** @internal SDK use only */
  setGlobalUserManager(userManager: UserManager): void;
  /** @internal SDK use only */
  getUserManager(): UserManager;
}

const NOOP_USER_MANAGER = new NoOpUserManager();
const INTERNAL_METHODS = new Set(['setDelegate', 'getDelegate']);

export class UserAPI {
  private static _instance?: UserAPIInstance;

  public static getInstance(): UserAPIInstance {
    if (!UserAPI._instance) {
      const proxyManager = new ProxyUserManager();

      const safeManager = createSafeProxy(
        proxyManager,
        NOOP_USER_MANAGER,
        diag.createComponentLogger({ namespace: 'UserAPI' }),
        INTERNAL_METHODS,
      );

      UserAPI._instance = Object.assign(safeManager, {
        setGlobalUserManager(userManager: UserManager): void {
          proxyManager.setDelegate(userManager);
        },
        getUserManager(): UserManager {
          return proxyManager;
        },
      }) as UserAPIInstance;
    }

    return UserAPI._instance;
  }

  public static resetInstance(): void {
    UserAPI._instance = undefined;
  }
}
