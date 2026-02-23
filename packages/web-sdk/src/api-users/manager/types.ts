import type { KEY_ENDUSER_PSEUDO_ID } from './constants/index.ts';

export interface User {
  [KEY_ENDUSER_PSEUDO_ID]: string;
}

export interface UserManager {
  getEmbraceUserId: () => string;

  getUserId: () => string | null;

  setUserId: (userId: string) => void;

  clearUserId: () => void;
}

export interface UserManagerInternal extends UserManager {
  setEmbraceUserId: (userId: string) => void;

  clearEmbraceUserId: () => void;
}
