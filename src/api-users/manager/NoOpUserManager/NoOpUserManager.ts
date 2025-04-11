import type { User, UserManager } from '../index.js';

export class NoOpUserManager implements UserManager {
  public clearUser(): void {
    // do nothing.
  }

  public getUser(): User | null {
    return null;
  }

  public setUser(): void {
    // do nothing.
  }
}
