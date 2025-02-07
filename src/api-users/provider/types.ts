import { KEY_ENDUSER_PSEUDO_ID } from '../../constants/attributes.js';

export interface User {
  [KEY_ENDUSER_PSEUDO_ID]: string;
}

export interface UserProvider {
  getUser(): User | null;

  setUser(user: User): void;

  clearUser(): void;
}
