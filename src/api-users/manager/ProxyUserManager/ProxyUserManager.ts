import type { User, UserManager } from '../index.js';
import { NoOpUserManager } from '../NoOpUserManager/index.js';

const NOOP_USER_MANAGER = new NoOpUserManager();

export class ProxyUserManager implements UserManager {
  private _delegate?: UserManager;

  public getDelegate(): UserManager {
    return this._delegate ?? NOOP_USER_MANAGER;
  }

  public setDelegate(delegate: UserManager): void {
    this._delegate = delegate;
  }

  public clearUser(): void {
    this.getDelegate().clearUser();
  }

  public getUser(): User | null {
    return this.getDelegate().getUser();
  }

  public setUser(user: User): void {
    this.getDelegate().setUser(user);
  }
}
