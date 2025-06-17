import type { UserManager } from '../index.js';

export class NoOpUserManager implements UserManager {
  public getUserId(): string | null {
    return null;
  }

  public setUserId(): void {}

  public clearUserId(): void {}
}
