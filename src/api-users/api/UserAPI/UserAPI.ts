import { ProxyUserManager, type UserManager } from '../../manager/index.js';
import type { UserAPIArgs } from './types.js';

export class UserAPI {
  private static _instance?: UserAPI;
  private readonly _proxyUserManager;

  private constructor({ proxyUserManager }: UserAPIArgs) {
    this._proxyUserManager = proxyUserManager;
  }

  public static getInstance(): UserAPI {
    if (!this._instance) {
      this._instance = new UserAPI({
        proxyUserManager: new ProxyUserManager()
      });
    }

    return this._instance;
  }

  public getUserManager(): UserManager {
    return this._proxyUserManager;
  }

  public setGlobalUserManager(userManager: UserManager): void {
    this._proxyUserManager.setDelegate(userManager);
  }
}
