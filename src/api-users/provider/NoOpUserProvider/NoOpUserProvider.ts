import { User, UserProvider } from '../types.js';

export class NoOpUserProvider implements UserProvider {
  getUserID(): string | null {
    return null;
  }

  getUser(): User | null {
    return null;
  }

  clearUser(): void {}

  setUser(): void {}
}
