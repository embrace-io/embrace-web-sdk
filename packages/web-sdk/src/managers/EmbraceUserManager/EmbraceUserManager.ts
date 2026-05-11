import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { UserManagerInternal } from '../../api-users/index.ts';
import type { NamespacedStorage } from '../../utils/index.ts';
import { generateUUID } from '../../utils/index.ts';
import {
  EMBRACE_EXTERNAL_USER_ID_KEY,
  EMBRACE_USER_ID_STORAGE_KEY,
} from './constants.ts';
import type { EmbraceUserManagerArgs } from './types.ts';
import { isUserId } from './types.ts';

export class EmbraceUserManager implements UserManagerInternal {
  private readonly _diag: DiagLogger;
  private readonly _storage: NamespacedStorage;
  private _embraceUserId: string | null = null;

  public constructor({ diag: diagParam, storage }: EmbraceUserManagerArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceUserManager',
      });
    this._storage = storage;
    this._initialSetup();
  }

  // No need to make this API more complicated by returning string | null
  // embraceUserId should never be null at this point, but just in case defaulting to a new one if is not present
  public getEmbraceUserId(): string {
    return this._embraceUserId || this._generateNewEmbraceUserId();
  }

  public setEmbraceUserId(userId: string) {
    this._embraceUserId = userId;
    this._storage.setItem(EMBRACE_USER_ID_STORAGE_KEY, userId);
  }

  public clearEmbraceUserId() {
    this._embraceUserId = null;
    this._storage.removeItem(EMBRACE_USER_ID_STORAGE_KEY);
  }

  private _initialSetup() {
    const embraceUserId = this._storage.getItem(EMBRACE_USER_ID_STORAGE_KEY);
    if (!embraceUserId) {
      this._diag.debug('No existing user found in storage, creating a new one');
    } else if (isUserId(embraceUserId)) {
      this._embraceUserId = embraceUserId;
    } else {
      this._diag.warn('Invalid embrace user id, generating a new one');
      this.clearEmbraceUserId();
    }

    if (!this._embraceUserId) {
      this._embraceUserId = this._generateNewEmbraceUserId();
    }
  }

  private _generateNewEmbraceUserId() {
    const newUserId = generateUUID();
    this.setEmbraceUserId(newUserId);

    return newUserId;
  }

  public getUserId(): string | null {
    return this._storage.getItem(EMBRACE_EXTERNAL_USER_ID_KEY);
  }

  // Storage is the source of truth so multiple tabs can share the same user id.
  public setUserId(userId: string): void {
    this._storage.setItem(EMBRACE_EXTERNAL_USER_ID_KEY, userId);
  }

  public clearUserId(): void {
    this._storage.removeItem(EMBRACE_EXTERNAL_USER_ID_KEY);
  }
}
