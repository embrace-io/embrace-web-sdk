import { diag } from '@opentelemetry/api';
import type { UserManager } from '../index.ts';
import { NoOpUserManager } from '../NoOpUserManager/index.ts';

const NOOP_USER_MANAGER = new NoOpUserManager();
const PROXY_DIAG = diag.createComponentLogger({
  namespace: 'ProxyUserManager',
});

export class ProxyUserManager implements UserManager {
  private _delegate?: UserManager;

  public getDelegate(): UserManager {
    if (!this._delegate) {
      PROXY_DIAG.debug('called before initSDK(); using no-op');
      return NOOP_USER_MANAGER;
    }
    return this._delegate;
  }

  public setDelegate(delegate: UserManager): void {
    this._delegate = delegate;
  }

  public getEmbraceUserId(): string {
    return this.getDelegate().getEmbraceUserId();
  }

  public getUserId(): string | null {
    return this.getDelegate().getUserId();
  }

  public setUserId(userId: string): void {
    this.getDelegate().setUserId(userId);
  }

  public clearUserId(): void {
    this.getDelegate().clearUserId();
  }
}
