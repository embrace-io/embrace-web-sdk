import { UserProvider } from '../../../api-users/index.js';
import { User } from '../../../api-users/provider/types.js';

export class EmbraceUserProvider implements UserProvider {
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
