import { UserManager } from '../../../api-users/index.js';
import { User } from '../../../api-users/manager/types.js';

export class EmbraceUserManager implements UserManager {
  private _activeUser: User | null = null;

  getUser(): User | null {
    return this._activeUser;
  }

  setUser(user: User) {
    this._activeUser = user;
  }

  clearUser() {
    this._activeUser = null;
  }
}
