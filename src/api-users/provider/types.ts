export interface User {
  id: string;
}

export interface UserProvider {
  getUserID(): string | null;

  getUser(): User | null;

  setUser(user: User): void;

  clearUser(): void;
}
