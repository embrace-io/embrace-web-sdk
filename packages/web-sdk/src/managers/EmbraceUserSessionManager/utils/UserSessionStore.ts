import type { DiagLogger } from '@opentelemetry/api';
import type { NamespacedStorage } from '../../../utils/index.ts';
import {
  EMBRACE_USER_SESSION_STATE_KEY,
  USER_SESSION_STATE_SCHEMA_VERSION,
} from '../constants.ts';
import type { UserSessionState } from '../types.ts';

export interface UserSessionStoreArgs {
  storage: NamespacedStorage;
  diag: DiagLogger;
}

/**
 * Treats the schemaVersion stamp as the contract. Every field is written
 * by createUserSessionState (and userSessionProperties is validated at
 * addProperty time), so a matching version means the blob came from this
 * code path and we trust the rest of its shape.
 */
const isValidStoredUserSessionState = (
  state: unknown,
): state is UserSessionState =>
  state !== null &&
  typeof state === 'object' &&
  (state as { schemaVersion?: unknown }).schemaVersion ===
    USER_SESSION_STATE_SCHEMA_VERSION;

/**
 * The user-session state shared by every tab. Each read goes to storage, so a
 * tab never acts on, or writes back, a copy another tab has since replaced.
 */
export class UserSessionStore {
  private readonly _storage: NamespacedStorage;
  private readonly _diag: DiagLogger;
  // Lets repeated reads of an unchanged value skip parsing and validation.
  private _lastRaw: string | null = null;
  private _lastState: UserSessionState | null = null;

  public constructor({ storage, diag }: UserSessionStoreArgs) {
    this._storage = storage;
    this._diag = diag;
  }

  public read(): UserSessionState | null {
    const raw = this._storage.getItem(EMBRACE_USER_SESSION_STATE_KEY);

    if (raw === this._lastRaw) {
      return this._lastState;
    }

    this._lastRaw = raw;
    this._lastState = raw === null ? null : this._parse(raw);

    if (raw !== null && this._lastState === null) {
      this._storage.removeItem(EMBRACE_USER_SESSION_STATE_KEY);
    }

    return this._lastState;
  }

  /** Returns false when the state didn't reach storage. */
  public write(state: UserSessionState): boolean {
    const raw = JSON.stringify(state);

    this._lastRaw = raw;
    this._lastState = state;

    return this._storage.setItem(EMBRACE_USER_SESSION_STATE_KEY, raw);
  }

  public clear(): void {
    this._storage.removeItem(EMBRACE_USER_SESSION_STATE_KEY);
  }

  // Returns null, after logging, when the stored state can't be trusted.
  private _parse(raw: string): UserSessionState | null {
    try {
      const parsed: unknown = JSON.parse(raw);

      if (!isValidStoredUserSessionState(parsed)) {
        throw new Error(
          'stored user session state failed structural validation',
        );
      }

      return parsed;
    } catch (e) {
      this._diag.error(
        'User session state in storage is corrupt; discarding it',
        e,
      );

      return null;
    }
  }
}
