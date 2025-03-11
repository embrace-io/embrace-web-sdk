import { ProxyUserManager, type UserManager } from '../../manager/index.js';

export class UserAPI {
  private static _instance?: UserAPI;
  private readonly _proxyUserManager = new ProxyUserManager();

  public static getInstance(): UserAPI {
    if (!this._instance) {
      this._instance = new UserAPI();
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
