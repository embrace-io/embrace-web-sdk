import type { KEY_ENDUSER_PSEUDO_ID } from './constants/index.js';

export interface User {
  [KEY_ENDUSER_PSEUDO_ID]: string;
}

export interface UserManager {
  getUser: () => User | null;

  setUser: (user: User) => void;

  clearUser: () => void;

  setIdentifier: (identifier: string) => void;
}
