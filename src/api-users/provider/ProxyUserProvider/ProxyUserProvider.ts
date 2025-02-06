import { User, UserProvider } from '../types.js';
import { NoOpUserProvider } from '../NoOpUserProvider/index.js';

const NOOP_USER_PROVIDER = new NoOpUserProvider();

export class ProxyUserProvider implements UserProvider {
  private _delegate?: UserProvider;

  getDelegate(): UserProvider {
    return this._delegate || NOOP_USER_PROVIDER;
  }

  setDelegate(delegate: UserProvider): void {
    this._delegate = delegate;
  }

  getUserID(): string | null {
    return this.getDelegate().getUserID();
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
