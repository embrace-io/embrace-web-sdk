import { UserManager } from '../../../api-users/index.js';
import { User } from '../../../api-users/manager/types.js';

export class EmbraceUserManager implements UserManager {
  private _activeUser: User | null = null;

  public getUser(): User | null {
    return this._activeUser;
  }

  public setUser(user: User) {
    this._activeUser = user;
  }

  public clearUser() {
    this._activeUser = null;
  }
}
