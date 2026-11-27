import type { DiagLogger } from '@opentelemetry/api';
import type { UserSessionEndReason } from '../../../api-sessions/index.ts';
import type { NamespacedStorage } from '../../../utils/index.ts';
import {
  EMBRACE_LAST_ACTIVITY_KEY,
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

/**
 * The latest activity in any tab, and the final candidate: the open session
 * part with the latest activity of its own.
 */
export interface LastActivity {
  readonly ts: number;
  /** Null right after the candidate's session part ends. */
  readonly sessionPartId: string | null;
  /** The candidate's own latest activity. */
  readonly sessionPartActivityTs: number | null;
}

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isLastActivity = (value: unknown): value is LastActivity => {
  const { ts, sessionPartId, sessionPartActivityTs } = (value ?? {}) as Record<
    string,
    unknown
  >;

  return (
    isTimestamp(ts) &&
    (sessionPartId === null || typeof sessionPartId === 'string') &&
    (sessionPartActivityTs === null || isTimestamp(sessionPartActivityTs))
  );
};

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
 * While a session part is open, the store pins it: the part's user session and
 * its latest activity. Reads return the pinned user session, refreshed from
 * storage while storage still holds it, so the part keeps reporting its own
 * user session after another tab replaced, ended or cleared it. Writes to it
 * from then on only update the pin.
 *
 * Once listening, the store also follows `storage` events, which report other
 * tabs' writes, and reports when one ended, replaced or cleared the pinned user
 * session. When one leaves the final candidate to a session part with earlier
 * activity, or to none, this tab's open session part takes it.
 */
export class UserSessionStore {
  private readonly _storage: NamespacedStorage;
  private readonly _diag: DiagLogger;

  // Lets repeated reads of an unchanged value skip parsing and validation.
  private _lastRaw: string | null = null;
  private _lastState: UserSessionState | null = null;

  // This tab's open session part: its user session, which reads return, and
  // its latest activity, which the shared last activity only keeps while it's
  // the final candidate.
  private _pinned: {
    readonly sessionPartId: string;
    readonly state: UserSessionState;
    readonly activityTs: number | null;
  } | null = null;

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

    return this._pinned?.state ?? stored;
  }

  /** Returns false when the state didn't reach storage. */
  public write(state: UserSessionState): boolean {
    if (
      this._pinned?.state.userSessionId === state.userSessionId &&
      !this._holdsLive(this._readStored(), state.userSessionId)
    ) {
      this._pinned = { ...this._pinned, state };

      return false;
    }

    return this._writeToStorage(state);
  }

  /**
   * Kept in its own key so frequent activity writes don't rewrite the
   * user-session state. Null when nothing valid is stored.
   */
  public readLastActivity(): LastActivity | null {
    const raw = this._storage.getItem(EMBRACE_LAST_ACTIVITY_KEY);

    if (raw === null) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      return isLastActivity(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Records activity in this tab's open session part. It becomes the final
   * candidate when its activity is at least as recent as the candidate's, or
   * when none is named. A tie replaces, so a session part starting at a
   * rollover's boundary wins over the part that ended there.
   */
  public recordActivity(ts: number, sessionPartId: string): void {
    if (this._pinned?.sessionPartId === sessionPartId) {
      this._pinned = { ...this._pinned, activityTs: ts };
    }

    const stored = this.readLastActivity();

    // An earlier activity than the candidate's is also earlier than the
    // stored latest activity, so nothing changes.
    if (
      stored !== null &&
      stored.sessionPartActivityTs !== null &&
      ts < stored.sessionPartActivityTs
    ) {
      return;
    }

    this._writeLastActivity({
      ts: Math.max(stored?.ts ?? ts, ts),
      sessionPartId,
      sessionPartActivityTs: ts,
    });
  }

  /**
   * Records the end of a session part that doesn't end the user session. A
   * session part that was the final candidate releases it, for another tab's
   * open session part to take.
   */
  public recordActivityAfterPartEnd(
    ts: number,
    endedSessionPartId: string,
  ): void {
    const stored = this.readLastActivity();
    const releases = stored?.sessionPartId === endedSessionPartId;

    if (stored && stored.ts >= ts && !releases) {
      return;
    }

    this._writeLastActivity({
      ts: Math.max(stored?.ts ?? ts, ts),
      sessionPartId: releases ? null : (stored?.sessionPartId ?? null),
      sessionPartActivityTs: releases
        ? null
        : (stored?.sessionPartActivityTs ?? null),
    });
  }

  /**
   * The session part that's final for `userSessionId`: the one recorded when
   * it ended, or, while it's still stored live or nothing is stored, the final
   * candidate. While it's stored live and no candidate is named yet, for
   * example right after the candidate's session part ended, the session part
   * ending it in this tab, `endingSessionPartId`, is final. Null when none is
   * known.
   */
  public readFinalSessionPartId(
    userSessionId: string,
    endingSessionPartId: string | null = null,
  ): string | null {
    const stored = this._readStored();

    if (!stored) {
      return this.readLastActivity()?.sessionPartId ?? null;
    }

    if (stored.userSessionId === userSessionId && !stored.ended) {
      return this.readLastActivity()?.sessionPartId ?? endingSessionPartId;
    }

    if (stored.userSessionId === userSessionId) {
      return stored.finalSessionPartId ?? null;
    }

    if (stored.previousUserSessionId === userSessionId) {
      return stored.previousFinalSessionPartId ?? null;
    }

    return null;
  }

  /** Holds `state` as the user session of this tab's open `sessionPartId`. */
  public pin(state: UserSessionState, sessionPartId: string): void {
    this._pinned = { sessionPartId, state, activityTs: null };
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
      const pinned = this._pinned?.state;

      if (key === EMBRACE_LAST_ACTIVITY_KEY) {
        this._claimFinalCandidate();

        return;
      }

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

  // Another tab's write can release the final candidate, or leave it to a
  // session part with earlier activity than this tab's open one, for example
  // when it wrote from a stale read. A tie doesn't claim, so two tabs don't
  // keep taking it from each other.
  private _claimFinalCandidate(): void {
    const pinned = this._pinned;
    const activityTs = pinned?.activityTs ?? null;
    const stored = this.readLastActivity();

    if (
      !pinned ||
      activityTs === null ||
      stored?.sessionPartId === pinned.sessionPartId ||
      (stored !== null &&
        stored.sessionPartActivityTs !== null &&
        stored.sessionPartActivityTs >= activityTs)
    ) {
      return;
    }

    this._writeLastActivity({
      ts: Math.max(stored?.ts ?? activityTs, activityTs),
      sessionPartId: pinned.sessionPartId,
      sessionPartActivityTs: activityTs,
    });
  }

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

  private _writeLastActivity(activity: LastActivity): void {
    this._storage.setItem(EMBRACE_LAST_ACTIVITY_KEY, JSON.stringify(activity));
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
    if (
      this._pinned &&
      this._holdsLive(state, this._pinned.state.userSessionId)
    ) {
      this._pinned = { ...this._pinned, state };
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
