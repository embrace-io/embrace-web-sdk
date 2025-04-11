import type { User, UserManager } from '../types.js';

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

  public setIdentifier(_identifier: string): void {
    // do nothing.
  }
}
