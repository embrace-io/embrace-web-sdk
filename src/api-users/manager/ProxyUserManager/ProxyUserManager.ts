import { User, UserManager } from '../types.js';
import { NoOpUserManager } from '../NoOpUserManager/index.js';

const NOOP_USER_MANAGER = new NoOpUserManager();

export class ProxyUserManager implements UserManager {
  private _delegate?: UserManager;

  getDelegate(): UserManager {
    return this._delegate || NOOP_USER_MANAGER;
  }

  setDelegate(delegate: UserManager): void {
    this._delegate = delegate;
  }

  getUser(): User | null {
    return this.getDelegate().getUser();
  }

  clearUser(): void {
    this.getDelegate().clearUser();
  }

  setUser(user: User): void {
    this.getDelegate().setUser(user);
  }
}
