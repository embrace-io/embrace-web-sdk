import { ProxyUserManager, type UserManager } from '../../manager/index.js';
import type { UserAPIArgs } from './types.js';
import type { User } from '../../manager/types.js';

export class UserAPI implements UserManager {
  private static _instance?: UserAPI;
  private readonly _proxyUserManager;

  private constructor({ proxyUserManager }: UserAPIArgs) {
    this._proxyUserManager = proxyUserManager;
  }

  public static getInstance(): UserAPI {
    if (!this._instance) {
      this._instance = new UserAPI({
        proxyUserManager: new ProxyUserManager(),
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

  public clearUser(): void {
    this.getUserManager().clearUser();
  }

  public getUser(): User | null {
    return this.getUserManager().getUser();
  }

  public setUser(user: User): void {
    this.getUserManager().setUser(user);
  }

  public setIdentifier(identifier: string): void {
    this.getUserManager().setIdentifier(identifier);
  }
}
