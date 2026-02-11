import type { UserManager } from '../index.ts';
import { NoOpUserManager } from '../NoOpUserManager/index.ts';

const NOOP_USER_MANAGER = new NoOpUserManager();

export class ProxyUserManager implements UserManager {
  private _delegate?: UserManager;

  public getDelegate(): UserManager {
    return this._delegate ?? NOOP_USER_MANAGER;
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
