import type { UserManager } from '../../api-users/index.js';
import { KEY_ENDUSER_PSEUDO_ID } from '../../api-users/index.js';
import type { User } from '../../api-users/manager/types.js';
import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { EmbraceUserManagerArgs } from './types.js';
import { isUser } from './types.js';
import { generateUUID } from '../../utils/index.js';
import { EMBRACE_USER_STORAGE_KEY } from './constants.js';

export class EmbraceUserManager implements UserManager {
  private readonly _diag: DiagLogger;
  private readonly _storage: Storage;
  private _activeUser: User | null = null;

  public constructor({
    diag: diagParam,
    storage = localStorage,
  }: EmbraceUserManagerArgs = {}) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceUserManager',
      });
    this._storage = storage;
    this._initialSetup();
  }

  public clearUser() {
    try {
      this._storage.removeItem(EMBRACE_USER_STORAGE_KEY);
    } catch (e) {
      this._diag.warn('Failed to retrieve user object from storage', e);
    }
    this._activeUser = null;
  }

  public getUser(): User | null {
    return this._activeUser;
  }

  public setUser(user: User) {
    this._activeUser = user;
  }

  private _initialSetup() {
    try {
      const encodedUserString = this._storage.getItem(EMBRACE_USER_STORAGE_KEY);
      if (!encodedUserString) {
        this._diag.debug(
          'No existing user found in storage, creating a new one'
        );
        this._generateNewUser();
        return;
      }

      const existingUser: unknown = JSON.parse(encodedUserString);
      if (isUser(existingUser)) {
        this.setUser(existingUser);
      } else {
        this._diag.warn(
          'Invalid user object in localStorage, defaulting to a new one'
        );
      }
    } catch (e) {
      this._diag.warn(
        'Failed to parse user from localStorage, defaulting to a new one',
        e
      );
    }

    if (!this._activeUser) {
      this._generateNewUser();
    }
  }

  private _generateNewUser() {
    const user: User = {
      [KEY_ENDUSER_PSEUDO_ID]: generateUUID(),
    };
    try {
      const encodedUserString = JSON.stringify(user);
      this._storage.setItem(EMBRACE_USER_STORAGE_KEY, encodedUserString);
    } catch (e) {
      this._diag.warn(
        'Failed to persist user object for storage, keeping it in-memory only',
        e
      );
    }
    this.setUser(user);
  }
}
