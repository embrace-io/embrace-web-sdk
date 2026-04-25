import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import {
  KEY_EMB_USER_SESSION_ID,
  KEY_EMB_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS,
  KEY_EMB_USER_SESSION_MAX_DURATION_SECONDS,
  KEY_EMB_USER_SESSION_NUMBER,
  KEY_EMB_USER_SESSION_PART_NUMBER,
  KEY_EMB_USER_SESSION_START_TS,
} from '../../constants/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';
import {
  generateUUID,
  getIncrementedCount,
  OTelPerformanceManager,
} from '../../utils/index.ts';
import {
  DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_MS,
  DEFAULT_USER_SESSION_MAX_DURATION_MS,
  EMBRACE_USER_SESSION_NUMBER_KEY,
  EMBRACE_USER_SESSION_STATE_KEY,
  END_USER_SESSION_COOLDOWN_MS,
  MAX_USER_SESSION_INACTIVITY_TIMEOUT_MS,
  MAX_USER_SESSION_MAX_DURATION_MS,
  MIN_USER_SESSION_INACTIVITY_TIMEOUT_MS,
  MIN_USER_SESSION_MAX_DURATION_MS,
} from './constants.ts';
import type {
  EmbraceUserSessionManagerArgs,
  SessionIds,
  TerminationInfo,
  UserSessionAttributes,
  UserSessionLifecycleManager,
  UserSessionState,
} from './types.ts';

const NO_TERMINATION: TerminationInfo = { isFinal: false, reason: null };

export class EmbraceUserSessionManager implements UserSessionLifecycleManager {
  private _state: UserSessionState | null = null;
  private _previousUserSessionId: string | null = null;
  private readonly _maxDurationMs: number;
  private readonly _inactivityTimeoutMs: number;
  private readonly _storage: Storage;
  private readonly _storageEventKey: string;
  private readonly _storageEventTarget: EventTarget | null;
  private readonly _diag: DiagLogger;
  private readonly _perf: PerformanceManager;
  private _maxDurationTimeout: ReturnType<typeof setTimeout> | null = null;
  private _endSessionPartCallback: (() => void) | null = null;
  private _startSessionPartCallback: (() => void) | null = null;
  private _pendingTermination: TerminationInfo = NO_TERMINATION;
  private readonly _sessionStartedListeners: Array<() => void> = [];
  private readonly _sessionEndedListeners: Array<() => void> = [];
  private _lastEndSessionTs: number | null = null;
  private _sessionIdOverride: string | null = null;

  public constructor({
    diag: diagParam,
    perf,
    storage = window.localStorage,
    storageEventTarget,
    config,
  }: EmbraceUserSessionManagerArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceUserSessionManager',
      });
    this._perf = perf ?? new OTelPerformanceManager();
    this._storage = storage;
    // Storage event keys are the underlying browser-level keys, which are
    // namespaced (e.g. `${appID}_embrace_user_session_state`) when the SDK
    // runs with registerGlobally:false. Resolve via NamespacedStorage when
    // available; plain Storage uses the logical key directly.
    const namespacedStorage = storage as Partial<{
      getStorageEventKey: (logicalKey: string) => string;
    }>;
    this._storageEventKey =
      namespacedStorage.getStorageEventKey?.(EMBRACE_USER_SESSION_STATE_KEY) ??
      EMBRACE_USER_SESSION_STATE_KEY;
    // Resolve storage event target lazily: the default `window` is unsafe to
    // touch in non-DOM environments (e.g., SSR pre-hydration), so guard it.
    this._storageEventTarget =
      storageEventTarget ?? (typeof window !== 'undefined' ? window : null);

    const maxDurationMs = this._clampMs(
      config?.maxDurationSeconds,
      DEFAULT_USER_SESSION_MAX_DURATION_MS,
      MIN_USER_SESSION_MAX_DURATION_MS,
      MAX_USER_SESSION_MAX_DURATION_MS,
    );
    const inactivityTimeoutMs = this._clampMs(
      config?.inactivityTimeoutSeconds,
      DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_MS,
      MIN_USER_SESSION_INACTIVITY_TIMEOUT_MS,
      MAX_USER_SESSION_INACTIVITY_TIMEOUT_MS,
    );

    // Per spec: inactivity_timeout <= max_duration.
    // If violated, fall back to default inactivity timeout.
    this._maxDurationMs = maxDurationMs;
    this._inactivityTimeoutMs =
      inactivityTimeoutMs <= maxDurationMs
        ? inactivityTimeoutMs
        : DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_MS;

    // Cross-tab propagation: when another tab clears or replaces the user
    // session state in localStorage, the in-memory `_state` here goes stale.
    // Without this listener, this tab keeps emitting telemetry tagged with
    // the dead session id, and onSessionPartEnd would resurrect the cleared
    // state on its next write-back. The listener fires only in OTHER tabs.
    this._storageEventTarget?.addEventListener(
      'storage',
      this._onStorage as EventListener,
    );
  }

  public dispose(): void {
    this._clearMaxDurationTimer();
    this._storageEventTarget?.removeEventListener(
      'storage',
      this._onStorage as EventListener,
    );
  }

  private readonly _onStorage = (event: StorageEvent): void => {
    if (event.key !== this._storageEventKey) {
      return;
    }
    try {
      const stored = this._readState();
      const oldSessionId = this._state?.userSessionId ?? null;
      const newSessionId = stored?.userSessionId ?? null;

      if (oldSessionId === newSessionId) {
        // Same session, just an update from another tab (e.g., partNumber
        // bump). Sync the in-memory copy so subsequent reads here use the
        // latest values.
        this._state = stored;
        return;
      }

      // Session changed externally. End any in-flight part on this tab with
      // reason 'user_session_ended'. Termination reason on the part is
      // intentionally left absent: we don't know whether the other tab's
      // ending was manual, max_duration, or inactivity.
      if (oldSessionId !== null) {
        this._previousUserSessionId = oldSessionId;
      }
      // Update _state BEFORE invoking the part-end callback so any read of
      // user-session ids during span finalization sees the new (possibly
      // null) state, satisfying spec 2.1 for the in-flight part.
      this._state = stored;
      try {
        this._endSessionPartCallback?.();
      } catch (e) {
        this._diag.warn(
          'Error in endPart callback during external session change',
          e,
        );
      }
      // Only fire ended-listeners when this tab actually had a session; if
      // we were already null, nothing transitioned for us.
      if (oldSessionId !== null) {
        this._notifyUserSessionEndedListeners();
      }
      // Deliberately do NOT auto-start a new part here. The next engagement
      // event (focus / visibility / activity) will start one through the
      // normal path, which respects the engagement gate.
    } catch (e) {
      this._diag.warn('Error handling storage event', e);
    }
  };

  public getUserSessionId(): string | null {
    return this._state?.userSessionId ?? null;
  }

  public getPreviousUserSessionId(): string | null {
    return this._previousUserSessionId;
  }

  public getUserSessionStartTime(): number | null {
    return this._state?.userSessionStartTs ?? null;
  }

  public getUserSessionAttributes(): UserSessionAttributes | null {
    if (!this._state) {
      return null;
    }
    return this._buildAttributes(this._state);
  }

  public getSessionIds(): SessionIds {
    const userSessionId = this._state?.userSessionId ?? '';
    const userSessionPreviousId = this._previousUserSessionId ?? '';
    return {
      // `session.id` respects the setSessionId() override even when no user
      // session is active, so callers that set an id before SDK init still see
      // it stamped on the first spans/logs.
      sessionId: this._sessionIdOverride ?? userSessionId,
      sessionPreviousId: userSessionPreviousId,
      userSessionId,
      userSessionPreviousId,
      sessionIdOverride: this._sessionIdOverride,
    };
  }

  public onSessionPartStart(): UserSessionAttributes {
    const now = this._perf.getNowMillis();
    let state = this._readState();
    let isNewSession = false;

    if (!state || this._isExpired(state, now)) {
      if (state) {
        this._previousUserSessionId = state.userSessionId;
        this._notifyUserSessionEndedListeners();
      }
      state = this._createSession(now);
      isNewSession = true;
    } else {
      // Re-read right before bumping partNumber: another tab may have started
      // a part since our initial read. Using storage's value when it has
      // advanced keeps the counter monotonic across tabs even though
      // localStorage is not transactional. Same pattern as onSessionPartEnd.
      // Guard on userSessionId equality so we never adopt a stranger session
      // mid-start.
      const stored = this._readState();
      if (
        stored &&
        stored.userSessionId === state.userSessionId &&
        stored.userSessionPartNumber > state.userSessionPartNumber
      ) {
        state = stored;
      }
      // Spec 1.1: invalidate the inactivity timeout when continuing an active
      // session so a stale value from the previous part-end cannot be read as
      // expired during the newly-started foreground part.
      state.inactivityDeadlineTs = null;
    }

    state.userSessionPartNumber++;
    this._writeState(state);
    this._state = state;
    this._setupMaxDurationTimer(state, now);

    if (isNewSession) {
      this._notifyUserSessionStartedListeners();
    }

    return this._buildAttributes(state);
  }

  public onSessionPartEnd(partEndTs?: number): void {
    this._clearMaxDurationTimer();

    if (!this._state) {
      return;
    }

    // Re-read from storage before writing: another tab may have bumped
    // userSessionPartNumber via its own onSessionPartStart since ours ran, and
    // writing our stale in-memory copy back would clobber that increment,
    // causing the next hard-nav in any tab to repeat a part number.
    const stored = this._readState();
    const base = stored ?? this._state;

    // Spec 1.1: at foreground part end, set the inactivity deadline. Expiry is
    // detected lazily on the next onSessionPartStart; we deliberately do
    // not run a JS timer here because the spec is lazy about inactivity
    // detection, and the part span for this part is already ending, so
    // emb.is_final_session_part and termination_reason='inactivity' can't be
    // attached. The spec marks those attributes optional; absence means "we
    // don't know".
    // The deadline is computed from the part's actual end time when the
    // caller supplies it, so a slow finalize/onEnd chain cannot extend the
    // window past what spec 1.1 prescribes.
    const endTs = partEndTs ?? this._perf.getNowMillis();
    base.inactivityDeadlineTs = endTs + base.inactivityTimeoutMs;
    this._writeState(base);
    this._state = base;
  }

  public setSessionPartCallbacks(callbacks: {
    endSessionPart: () => void;
    startSessionPart: () => void;
  }): void {
    this._endSessionPartCallback = callbacks.endSessionPart;
    this._startSessionPartCallback = callbacks.startSessionPart;
  }

  public getTerminationInfo(): TerminationInfo {
    const info = this._pendingTermination;
    this._pendingTermination = NO_TERMINATION;
    return info;
  }

  public endUserSession(): void {
    // Cooldown applies regardless of whether a session is currently active so
    // back-to-back calls are rate-limited even if one happens to land between
    // sessions; otherwise a tight loop could repeatedly mark _lastEndSessionTs
    // and bypass the cooldown on the next active session.
    const now = this._perf.getNowMillis();
    if (
      this._lastEndSessionTs !== null &&
      now - this._lastEndSessionTs < END_USER_SESSION_COOLDOWN_MS
    ) {
      this._diag.warn(
        'endUserSession called within cooldown period, ignoring.',
      );
      return;
    }

    if (!this._state) {
      this._diag.debug(
        'Trying to end user session, but there is no active session. This is a no-op.',
      );
      return;
    }
    this._lastEndSessionTs = now;

    // Stamp the termination reason as pending; the part manager consumes it
    // via getTerminationInfo() during endSessionPartInternal and applies it
    // to the part span's attributes. If no part is active right now, the
    // callback is a no-op and the previously-finalized part keeps whatever
    // end_reason it was already exported with; there's no part span left
    // to carry the 'manual' reason. Per spec the attribute is optional,
    // so this is acceptable; see UserSessionManager.endUserSession JSDoc.
    this._pendingTermination = { isFinal: true, reason: 'manual' };
    try {
      this._endSessionPartCallback?.();
    } catch (e) {
      this._diag.warn(
        'Error in endPart callback during session termination',
        e,
      );
    } finally {
      // getTerminationInfo() normally clears this when the part manager reads
      // it during endSessionPartInternal. Reset explicitly here so a thrown
      // callback cannot leave a stale pending-termination flag for the next
      // part start to pick up.
      this._pendingTermination = NO_TERMINATION;
    }

    // Fire ended-listeners while _state still holds the dying session so
    // listeners can read getUserSessionId() and observe the session that just
    // ended. Wrap in try/finally so a bug in the notify path cannot leave
    // _state populated for the next session-part start.
    try {
      this._notifyUserSessionEndedListeners();
    } finally {
      this._previousUserSessionId = this._state?.userSessionId ?? null;
      this._state = null;
      this._clearStoredState();
    }

    try {
      this._startSessionPartCallback?.();
    } catch (e) {
      this._diag.warn(
        'Error in startPart callback during session termination',
        e,
      );
    }
  }

  public setSessionId(id: string | null): void {
    if (id !== null && typeof id !== 'string') {
      this._diag.warn(
        'setSessionId expects a string or null; ignoring non-string value.',
      );
      return;
    }
    if (id !== null && id.trim() === '') {
      this._diag.warn(
        'setSessionId called with an empty or whitespace-only string; ignoring.',
      );
      return;
    }
    this._sessionIdOverride = id;
  }

  public addUserSessionStartedListener(listener: () => void): () => void {
    this._sessionStartedListeners.push(listener);
    return () => {
      const i = this._sessionStartedListeners.indexOf(listener);
      if (i !== -1) {
        this._sessionStartedListeners.splice(i, 1);
      }
    };
  }

  public addUserSessionEndedListener(listener: () => void): () => void {
    this._sessionEndedListeners.push(listener);
    return () => {
      const i = this._sessionEndedListeners.indexOf(listener);
      if (i !== -1) {
        this._sessionEndedListeners.splice(i, 1);
      }
    };
  }

  private _notifyUserSessionStartedListeners(): void {
    for (const listener of this._sessionStartedListeners) {
      try {
        listener();
      } catch (e) {
        this._diag.warn('Error in user session started listener', e);
      }
    }
  }

  private _notifyUserSessionEndedListeners(): void {
    for (const listener of this._sessionEndedListeners) {
      try {
        listener();
      } catch (e) {
        this._diag.warn('Error in user session ended listener', e);
      }
    }
  }

  private _clampMs(
    seconds: number | undefined,
    defaultMs: number,
    minMs: number,
    maxMs: number,
  ): number {
    if (seconds === undefined) {
      return defaultMs;
    }
    const ms = seconds * 1000;
    if (ms < minMs || ms > maxMs) {
      return defaultMs;
    }
    return ms;
  }

  private _isExpired(state: UserSessionState, now: number): boolean {
    // Spec 6.1: if the device clock jumped backwards before the recorded
    // session start, treat the session as expired and start a fresh one.
    if (now < state.userSessionStartTs) {
      return true;
    }
    if (now >= state.sessionMaxEndTs) {
      return true;
    }
    // Inactivity only applies once a part has ended (inactivityDeadlineTs is
    // set then). While a part is active the value is null, so inactivity
    // cannot expire the session mid-part; only max-duration can.
    return (
      state.inactivityDeadlineTs !== null && now >= state.inactivityDeadlineTs
    );
  }

  private _createSession(now: number): UserSessionState {
    const userSessionNumber = getIncrementedCount(
      this._storage,
      EMBRACE_USER_SESSION_NUMBER_KEY,
      this._diag,
    );

    return {
      userSessionId: generateUUID(),
      userSessionStartTs: now,
      sessionMaxEndTs: now + this._maxDurationMs,
      // A new session's first part starts immediately after this returns.
      inactivityDeadlineTs: null,
      userSessionNumber,
      userSessionPartNumber: 0,
      // Lock the config in for this session's lifetime (spec 3, edge case 2).
      maxDurationMs: this._maxDurationMs,
      inactivityTimeoutMs: this._inactivityTimeoutMs,
    };
  }

  private _buildAttributes(state: UserSessionState): UserSessionAttributes {
    // `session.id` is the OTel standard attribute and may be overridden via
    // setSessionId(). `emb.user_session_id` is the SDK-owned user session UUID
    // and is never affected by the override.
    return {
      [ATTR_SESSION_ID]: this._sessionIdOverride ?? state.userSessionId,
      [KEY_EMB_USER_SESSION_ID]: state.userSessionId,
      [KEY_EMB_USER_SESSION_NUMBER]: state.userSessionNumber,
      [KEY_EMB_USER_SESSION_PART_NUMBER]: state.userSessionPartNumber,
      [KEY_EMB_USER_SESSION_START_TS]: state.userSessionStartTs,
      [KEY_EMB_USER_SESSION_MAX_DURATION_SECONDS]: Math.round(
        state.maxDurationMs / 1000,
      ),
      [KEY_EMB_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS]: Math.round(
        state.inactivityTimeoutMs / 1000,
      ),
    };
  }

  private _setupMaxDurationTimer(state: UserSessionState, now: number): void {
    this._clearMaxDurationTimer();

    const remaining = state.sessionMaxEndTs - now;
    if (remaining <= 0) {
      return;
    }

    this._maxDurationTimeout = setTimeout(() => {
      this._maxDurationTimeout = null;
      this._pendingTermination = {
        isFinal: true,
        reason: 'max_duration_reached',
      };
      try {
        this._endSessionPartCallback?.();
      } catch (e) {
        this._diag.warn(
          'Error in endPart callback during max duration expiry',
          e,
        );
      } finally {
        // See endUserSession: reset explicitly so a thrown callback cannot
        // leave a stale pending-termination flag for the next part start.
        this._pendingTermination = NO_TERMINATION;
      }

      // Fire ended-listeners while _state still holds the dying session so
      // listeners can read getUserSessionId(); see endUserSession for the
      // same ordering.
      try {
        this._notifyUserSessionEndedListeners();
      } finally {
        this._previousUserSessionId = this._state?.userSessionId ?? null;
        this._state = null;
        this._clearStoredState();
      }

      try {
        this._startSessionPartCallback?.();
      } catch (e) {
        this._diag.warn(
          'Error in startPart callback during max duration expiry',
          e,
        );
      }
    }, remaining);
  }

  private _clearMaxDurationTimer(): void {
    if (this._maxDurationTimeout !== null) {
      clearTimeout(this._maxDurationTimeout);
      this._maxDurationTimeout = null;
    }
  }

  private _clearStoredState(): void {
    try {
      this._storage.removeItem(EMBRACE_USER_SESSION_STATE_KEY);
    } catch (e) {
      this._diag.warn('Failed to clear user session state from storage', e);
    }
  }

  private _readState(): UserSessionState | null {
    let raw: string | null = null;
    try {
      raw = this._storage.getItem(EMBRACE_USER_SESSION_STATE_KEY);
    } catch (e) {
      this._diag.warn('Failed to read user session state from storage', e);
      return null;
    }
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as UserSessionState;
    } catch (e) {
      // Corrupt data in storage would otherwise be read on every start and keep failing;
      // clear it so the next write starts from a clean slate.
      this._diag.error(
        'User session state in storage is corrupt; discarding it',
        e,
      );
      this._clearStoredState();
      return null;
    }
  }

  private _writeState(state: UserSessionState): void {
    try {
      this._storage.setItem(
        EMBRACE_USER_SESSION_STATE_KEY,
        JSON.stringify(state),
      );
    } catch (e) {
      this._diag.warn('Failed to write user session state to storage', e);
    }
  }
}
