import type { DiagLogger } from '@opentelemetry/api';
import type { UserSessionEndReason } from '../../../api-sessions/index.ts';
import type { NamespacedStorage } from '../../../utils/index.ts';
import {
  EMBRACE_USER_SESSION_STATE_KEY,
  USER_SESSION_STATE_SCHEMA_VERSION,
} from '../constants.ts';
import type { UserSessionState } from '../types.ts';

export interface UserSessionStoreArgs {
  storage: NamespacedStorage;
  diag: DiagLogger;
  /** Where `storage` events arrive; defaults to `window`. */
  target?: EventTarget;
}

/** How a write to storage changed the pinned user session. */
export type UserSessionChange =
  | { readonly kind: 'ended'; readonly endReason?: UserSessionEndReason }
  | { readonly kind: 'replaced' }
  | { readonly kind: 'cleared' };

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
 *
 * Once listening, the store also follows `storage` events, which report other
 * tabs' writes, and reports when one ended, replaced or cleared the pinned user
 * session.
 */
export class UserSessionStore {
  private readonly _storage: NamespacedStorage;
  private readonly _diag: DiagLogger;

  // Lets repeated reads of an unchanged value skip parsing and validation.
  private _lastRaw: string | null = null;
  private _lastState: UserSessionState | null = null;

  // Last value of stored user session this tab saw
  private _pinned: UserSessionState | null = null;

  private readonly _target: EventTarget;
  private readonly _userSessionChangeListeners = new Set<
    (change: UserSessionChange) => void
  >();

  public constructor({ storage, diag, target = window }: UserSessionStoreArgs) {
    this._storage = storage;
    this._diag = diag;
    this._target = target;
  }

  /**
   * Calls `listener` when another tab ends, replaces or clears the pinned user
   * session. Returns a function that removes it.
   */
  public addUserSessionChangeListener(
    listener: (change: UserSessionChange) => void,
  ): () => void {
    if (this._userSessionChangeListeners.size === 0) {
      this._target.addEventListener('storage', this._onStorage);
    }

    this._userSessionChangeListeners.add(listener);

    return () => {
      this._userSessionChangeListeners.delete(listener);

      if (this._userSessionChangeListeners.size === 0) {
        this._target.removeEventListener('storage', this._onStorage);
      }
    };
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

    return this._writeToStorage(state);
  }

  public pin(state: UserSessionState): void {
    this._pinned = state;
  }

  public unpin(): void {
    this._pinned = null;
  }

  // With nothing pinned, no session part is open and reads already follow
  // storage, so only writes made while one is open matter here.
  private readonly _onStorage = (event: Event): void => {
    try {
      const storageEvent = event as StorageEvent;
      const key = this._storage.keyChangedBy(storageEvent);
      const pinned = this._pinned;

      if (!pinned || (key !== null && key !== EMBRACE_USER_SESSION_STATE_KEY)) {
        return;
      }

      const written =
        key === null || storageEvent.newValue === null
          ? null
          : this._parse(storageEvent.newValue);

      if (written?.userSessionId === pinned.userSessionId) {
        if (written.ended) {
          this._notifyUserSessionChange({
            kind: 'ended',
            endReason: written.endReason,
          });
        } else {
          this._refreshPinned(written);
        }

        return;
      }

      // The pinned user session only exists because the one it follows
      // ended, so a write of that one is stale.
      if (written && written.userSessionId === pinned.previousUserSessionId) {
        this._writeToStorage(pinned);

        return;
      }

      this._notifyUserSessionChange(
        written ? { kind: 'replaced' } : { kind: 'cleared' },
      );
    } catch (e) {
      this._diag.warn('Error handling a user session change', e);
    }
  };

  private _notifyUserSessionChange(change: UserSessionChange): void {
    for (const listener of this._userSessionChangeListeners) {
      try {
        listener(change);
      } catch (error) {
        this._diag.warn(
          'Error while executing user session change listener',
          error,
        );
      }
    }
  }

  private _writeToStorage(state: UserSessionState): boolean {
    const raw = JSON.stringify(state);

    this._lastRaw = raw;
    this._lastState = state;
    this._refreshPinned(state);

    return this._storage.setItem(EMBRACE_USER_SESSION_STATE_KEY, raw);
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
