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
