import { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import { isUser } from './types.js';
import { generateUUID } from '../../../utils/index.js';
import { EMBRACE_USER_LOCAL_STORAGE_KEY } from './constants.js';
import { User } from '../../../api-users/provider/types.js';

export class LocalStorageUserInstrumentation extends InstrumentationBase {
  constructor() {
    super('UserInstrumentation', '1.0.0', {});
    if (this._config.enabled) {
      this.enable();
    }
  }

  disable(): void {
    localStorage.removeItem(EMBRACE_USER_LOCAL_STORAGE_KEY);
    this.userProvider.clearUser();
  }

  enable(): void {
    const encodedUserString = localStorage.getItem(
      EMBRACE_USER_LOCAL_STORAGE_KEY
    );
    if (encodedUserString) {
      try {
        const existingUser: unknown = JSON.parse(encodedUserString);
        if (isUser(existingUser)) {
          this.userProvider.setUser(existingUser);
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

  // no-op
  protected init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    | void {
    return undefined;
  }

  private _generateNewUser() {
    const user: User = {
      id: generateUUID(),
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
    this.userProvider.setUser(user);
  }
}
