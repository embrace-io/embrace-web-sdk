import { User, UserManager } from '../types.js';

export class NoOpUserManager implements UserManager {
  public getUser(): User | null {
    return null;
  }

  public clearUser(): void {
    // do nothing.
  }

  public setUser(): void {
    // do nothing.
  }
}
