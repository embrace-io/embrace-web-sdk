import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { User, UserManagerInternal } from '../../api-users/index.js';
import { KEY_ENDUSER_PSEUDO_ID } from '../../api-users/index.js';
import { generateUUID } from '../../utils/index.js';
import {
  EMBRACE_EXTERNAL_USER_ID_KEY,
  EMBRACE_USER_STORAGE_KEY,
} from './constants.js';
import type { EmbraceUserManagerArgs } from './types.js';
import { isUser } from './types.js';

export class EmbraceUserManager implements UserManagerInternal {
  private readonly _diag: DiagLogger;
  private readonly _storage: Storage;
  // This User holds the EmbraceUserId or DeviceId
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
          'Invalid user object in storage, defaulting to a new one'
        );
      }
    } catch (e) {
      this._diag.warn(
        'Failed to parse user from storage, defaulting to a new one',
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

  // This is the external user id that can be set by the user
  public getUserId(): string | null {
    return this._storage.getItem(EMBRACE_EXTERNAL_USER_ID_KEY);
  }

  // Use storage as source of truth so multiple tabs can share the same user id
  public setUserId(userId: string): void {
    this._storage.setItem(EMBRACE_EXTERNAL_USER_ID_KEY, userId);
  }

  public clearUserId(): void {
    this._storage.removeItem(EMBRACE_EXTERNAL_USER_ID_KEY);
  }
}
