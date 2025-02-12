import { User, UserProvider } from '../types.js';

export class NoOpUserProvider implements UserProvider {
  getUser(): User | null {
    return null;
  }

  clearUser(): void {}

  setUser(): void {}
}
