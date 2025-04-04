import { user } from '../../../api-users/index.js';
import { KEY_ENDUSER_PSEUDO_ID } from '../../../api-users/manager/constants/index.js';
import type { User, UserManager } from '../../../api-users/manager/types.js';
import { generateUUID } from '../../../utils/index.js';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import { EMBRACE_USER_LOCAL_STORAGE_KEY } from './constants.js';
import { isUser } from './types.js';

export class LocalStorageUserInstrumentation extends InstrumentationBase {
  private readonly _userManager: UserManager;

  public constructor() {
    super('UserInstrumentation', '1.0.0', {});
    this._userManager = user.getUserManager();
    if (this._config.enabled) {
      this.enable();
    }
  }

  /* Returns user provider */
  protected get userManager(): UserManager {
    return this._userManager;
  }

  public disable(): void {
    localStorage.removeItem(EMBRACE_USER_LOCAL_STORAGE_KEY);
    this.userManager.clearUser();
  }

  public enable(): void {
    const encodedUserString = localStorage.getItem(
      EMBRACE_USER_LOCAL_STORAGE_KEY
    );
    if (encodedUserString) {
      try {
        const existingUser: unknown = JSON.parse(encodedUserString);
        if (isUser(existingUser)) {
          this.userManager.setUser(existingUser);
        } else {
          console.warn(
            'Invalid user object in localStorage, defaulting to a new one'
          );
          this._generateNewUser();
        }
      } catch (e) {
        console.warn(
          'Failed to parse user from localStorage, defaulting to a new one',
          e
        );
        this._generateNewUser();
      }
    } else {
      this._generateNewUser();
    }
  }

  private _generateNewUser() {
    const user: User = {
      [KEY_ENDUSER_PSEUDO_ID]: generateUUID(),
    };
    try {
      const encodedUserString = JSON.stringify(user);
      localStorage.setItem(EMBRACE_USER_LOCAL_STORAGE_KEY, encodedUserString);
    } catch (e) {
      console.warn(
        'Failed to persist user object for localStorage storage, keeping it in-memory only',
        e
      );
    }
    this.userManager.setUser(user);
  }
}
