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
 * The user-session state shared by every tab. Reads and writes go to storage,
 * so a tab never writes back a copy another tab has since replaced.
 *
 * An ended user session stays in storage, marked `ended`, until the next one
 * replaces it, so the next one can follow it.
 *
 * While a session part is open, the store pins the part's user session. Reads
 * return it, refreshed from storage while storage still holds it, so the part
 * keeps reporting its own user session after another tab replaced, ended or
 * cleared it. Writes to it from then on only update the pin.
 */
export class UserSessionStore {
  private readonly _storage: NamespacedStorage;
  private readonly _diag: DiagLogger;

  // Lets repeated reads of an unchanged value skip parsing and validation.
  private _lastRaw: string | null = null;
  private _lastState: UserSessionState | null = null;

  // Last value of stored user session this tab saw
  private _pinned: UserSessionState | null = null;

  public constructor({ storage, diag }: UserSessionStoreArgs) {
    this._storage = storage;
    this._diag = diag;
  }

  public read(): UserSessionState | null {
    const stored = this._readStored();

    return this._pinned ?? stored;
  }

  /** Returns false when the state didn't reach storage. */
  public write(state: UserSessionState): boolean {
    if (
      this._pinned?.userSessionId === state.userSessionId &&
      !this._holdsLive(this._readStored(), state.userSessionId)
    ) {
      this._pinned = state;

      return false;
    }

    const raw = JSON.stringify(state);

    this._lastRaw = raw;
    this._lastState = state;
    this._refreshPinned(state);

    return this._storage.setItem(EMBRACE_USER_SESSION_STATE_KEY, raw);
  }

  public pin(state: UserSessionState): void {
    this._pinned = state;
  }

  public unpin(): void {
    this._pinned = null;
  }

  private _readStored(): UserSessionState | null {
    const raw = this._storage.getItem(EMBRACE_USER_SESSION_STATE_KEY);

    if (raw !== this._lastRaw) {
      this._lastRaw = raw;
      this._lastState = raw === null ? null : this._parse(raw);

      if (raw !== null && this._lastState === null) {
        this._storage.removeItem(EMBRACE_USER_SESSION_STATE_KEY);
      }
    }

    this._refreshPinned(this._lastState);

    return this._lastState;
  }

  private _refreshPinned(state: UserSessionState | null): void {
    if (this._pinned && this._holdsLive(state, this._pinned.userSessionId)) {
      this._pinned = state;
    }
  }

  // Storage still holds this user session, and it hasn't ended.
  private _holdsLive(
    state: UserSessionState | null,
    userSessionId: string,
  ): state is UserSessionState {
    return state?.userSessionId === userSessionId && !state.ended;
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
