import { User, UserManager } from '../types.js';

export class NoOpUserManager implements UserManager {
  getUser(): User | null {
    return null;
  }

  clearUser(): void {}

  setUser(): void {}
}
