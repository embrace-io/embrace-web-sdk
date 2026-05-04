import type {
  Attributes,
  DiagLogger,
  HrTime,
  Tracer,
  TracerProvider,
} from '@opentelemetry/api';
import { diag, trace } from '@opentelemetry/api';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import type {
  PropertyOptions,
  SessionPartEndReason,
  SessionPartStartReason,
  TerminationInfo,
} from '../../api-sessions/manager/types.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import {
  EMB_STATES,
  EMB_TYPES,
  KEY_EMB_COLD_START,
  KEY_EMB_IS_FINAL_SESSION_PART,
  KEY_EMB_SDK_STARTUP_DURATION,
  KEY_EMB_SESSION_PART_END_REASON,
  KEY_EMB_SESSION_PART_ID,
  KEY_EMB_SESSION_PART_START_REASON,
  KEY_EMB_STATE,
  KEY_EMB_TYPE,
  KEY_EMB_USER_SESSION_ID,
  KEY_EMB_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS,
  KEY_EMB_USER_SESSION_MAX_DURATION_SECONDS,
  KEY_EMB_USER_SESSION_NUMBER,
  KEY_EMB_USER_SESSION_PART_NUMBER,
  KEY_EMB_USER_SESSION_START_TS,
  KEY_EMB_USER_SESSION_TERMINATION_REASON,
  KEY_PREFIX_EMB_PROPERTIES,
} from '../../constants/index.ts';
import type { ExtendedSpan } from '../../index.ts';
import type { PerformanceManager, SafeStorageLike } from '../../utils/index.ts';
import {
  generateUUID,
  getIncrementedCount,
  getVisibilityState,
  OTelPerformanceManager,
  SafeStorage,
} from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';
import { EmbraceExtendedSpan } from '../EmbraceTraceManager/EmbraceExtendedSpan.ts';
import {
  DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_MS,
  DEFAULT_USER_SESSION_MAX_DURATION_MS,
  EMBRACE_USER_SESSION_CORRUPT_MARKER_KEY,
  EMBRACE_USER_SESSION_INACTIVITY_DEADLINE_KEY,
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
  SessionPartEndedListener,
  SessionPartStartedListener,
  UserSessionAttributes,
  UserSessionManagerInternal,
  UserSessionState,
} from './types.ts';

/**
 * Owns both layers of session bookkeeping in one class:
 *
 * - User-session lifecycle: cross-tab continuity (via a shared localStorage
 *   row plus a `storage` event listener), the max-duration timer, lazy
 *   inactivity expiry on part start, and user-session listeners.
 * - Session-part lifecycle: the `emb-session` span, breadcrumbs, properties
 *   (in-memory user-session-scoped + permanent localStorage-backed), and
 *   per-part counters consumed by the batched span processor.
 *
 * The two layers share termination state, the active part span, and the
 * persisted user-session row, so co-locating them avoids round-tripping
 * through callbacks and keeps the rollover sequence (end part → terminate
 * user session → start new part) atomic from the caller's perspective.
 */
export class EmbraceUserSessionManager implements UserSessionManagerInternal {
  private _state: UserSessionState | null = null;
  private _previousUserSessionId: string | null = null;
  private readonly _maxDurationMs: number;
  private readonly _inactivityTimeoutMs: number;
  private readonly _storageEventKey: string;
  private readonly _storageEventTarget: EventTarget | null;
  private _maxDurationTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly _userSessionStartedListeners: Array<() => void> = [];
  private readonly _userSessionEndedListeners: Array<() => void> = [];
  private _lastEndUserSessionTs: number | null = null;
  private _inEndUserSession = false;
  private _userSessionIdOverride: string | null = null;
  // User-session-scoped properties added via addProperty without
  // lifespan: 'permanent'. Keys are already prefixed with
  // KEY_PREFIX_EMB_PROPERTIES and length-limited. Cleared on user-session
  // end. Permanent properties live in localStorage instead.
  private readonly _userSessionProperties: Map<string, string> = new Map();

  private _activeSessionPartId: string | null = null;
  private _activeSessionPartStartTime: HrTime | null = null;
  private _sessionPartSpan: ExtendedSpan | null = null;
  private _activeSessionPartCounts: Record<string, number> | null = null;
  // Stamped on the part span as emb.cold_start; flipped off on first start.
  private _coldStart = true;
  private _nextSessionPartCounts: Record<string, number> = {};
  private _sdkStartupDuration = 0;
  private readonly _sessionPartStartedListeners: Array<SessionPartStartedListener> =
    [];
  private readonly _sessionPartEndedListeners: Array<SessionPartEndedListener> =
    [];
  private _tracer: Tracer;

  private readonly _diag: DiagLogger;
  private readonly _perf: PerformanceManager;
  private readonly _storage: SafeStorageLike;
  private readonly _visibilityDoc: VisibilityStateDocument;
  private readonly _limitManager: LimitManagerInternal | null;
  // Mirrors the inactivity deadline when SafeStorage has flipped to disabled
  // (see SafeStorage.isDisabled). Cross-tab consistency is lost; the local
  // user session keeps recording.
  private _inMemoryInactivityDeadline: number | null = null;

  public constructor({
    diag: diagParam,
    perf,
    storage,
    storageEventTarget,
    config,
    visibilityDoc = window.document,
    limitManager,
  }: EmbraceUserSessionManagerArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceUserSessionManager',
      });
    this._perf = perf ?? new OTelPerformanceManager();
    this._storage = storage ?? new SafeStorage(window.localStorage, this._diag);
    this._visibilityDoc = visibilityDoc;
    this._limitManager = limitManager ?? null;
    this._tracer = trace.getTracer('SessionPartActivityInstrumentation');

    // Storage event keys are the underlying browser-level keys, which are
    // namespaced (e.g. `${appID}_embrace_user_session_state`) when the SDK
    // runs with registerGlobally:false. SafeStorage resolves the namespaced
    // key when wrapping a NamespacedStorage and returns the logical key
    // otherwise.
    this._storageEventKey = this._storage.getStorageEventKey(
      EMBRACE_USER_SESSION_STATE_KEY,
    );
    this._storageEventTarget =
      storageEventTarget ?? (typeof window !== 'undefined' ? window : null);

    const maxDurationMs = this._clampMs(
      'maxDurationSeconds',
      config?.maxDurationSeconds,
      DEFAULT_USER_SESSION_MAX_DURATION_MS,
      MIN_USER_SESSION_MAX_DURATION_MS,
      MAX_USER_SESSION_MAX_DURATION_MS,
    );
    const inactivityTimeoutMs = this._clampMs(
      'inactivityTimeoutSeconds',
      config?.inactivityTimeoutSeconds,
      DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_MS,
      MIN_USER_SESSION_INACTIVITY_TIMEOUT_MS,
      MAX_USER_SESSION_INACTIVITY_TIMEOUT_MS,
    );

    // Per spec: inactivity_timeout <= max_duration. If violated, fall back to
    // default inactivity timeout.
    this._maxDurationMs = maxDurationMs;
    if (inactivityTimeoutMs <= maxDurationMs) {
      this._inactivityTimeoutMs = inactivityTimeoutMs;
    } else {
      this._diag.warn(
        `inactivityTimeoutSeconds (${(inactivityTimeoutMs / 1000).toString()}s) ` +
          `exceeds maxDurationSeconds (${(maxDurationMs / 1000).toString()}s); ` +
          `falling back to default inactivity timeout (${(DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_MS / 1000).toString()}s).`,
      );
      this._inactivityTimeoutMs = DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_MS;
    }

    this._storageEventTarget?.addEventListener(
      'storage',
      this._onStorage as EventListener,
    );

    // The originating tab that wrote a corruption marker won't get a
    // storage event for it; consume any stale marker here so single-tab
    // sessions don't leave it lingering.
    this._consumeCorruptionMarker();
  }

  public dispose(): void {
    this._clearMaxDurationTimer();
    this._storageEventTarget?.removeEventListener(
      'storage',
      this._onStorage as EventListener,
    );
  }

  public setTracerProvider(tracerProvider: TracerProvider): void {
    this._tracer = tracerProvider.getTracer(
      'SessionPartActivityInstrumentation',
    );
  }

  public recordSDKStartupDuration(duration: number): void {
    this._sdkStartupDuration = Math.ceil(duration);
  }

  public getUserSessionId(): string | null {
    return this._state?.userSessionId ?? null;
  }

  public getPreviousUserSessionId(): string | null {
    // Prefer the persisted value: cross-tab rollovers update storage and the
    // _onStorage handler hydrates _state from it, and page reloads read the
    // stored row at init. Fall back to in-memory for the brief window during
    // user-session termination where storage is cleared but the just-ended
    // id is still held in memory for the cascade.
    return this._state?.previousUserSessionId ?? this._previousUserSessionId;
  }

  public getUserSessionStartTime(): number | null {
    return this._state?.userSessionStartTs ?? null;
  }

  public getUserSessionAttributes(): UserSessionAttributes | null {
    if (!this._state) {
      return null;
    }
    return this._buildUserSessionAttributes(this._state);
  }

  public getUserSessionIdOverride(): string | null {
    return this._userSessionIdOverride;
  }

  public endUserSession(): void {
    // Reject synchronous re-entry from a listener that calls endUserSession
    // during the outer call's notification phase.
    if (this._inEndUserSession) {
      this._diag.warn(
        'endUserSession called re-entrantly from a listener; ignoring inner call.',
      );
      return;
    }

    // Cooldown precedes the no-state early-return so back-to-back calls are
    // rejected even when one lands between sessions; _lastEndUserSessionTs
    // is only advanced for active terminations.
    const now = this._perf.getNowMillis();
    if (
      this._lastEndUserSessionTs !== null &&
      now - this._lastEndUserSessionTs < END_USER_SESSION_COOLDOWN_MS
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
    this._lastEndUserSessionTs = now;
    this._inEndUserSession = true;
    try {
      this._terminateSession({ isFinal: true, reason: 'manual' });
    } finally {
      this._inEndUserSession = false;
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
    this._userSessionIdOverride = id;
  }

  public addUserSessionStartedListener(listener: () => void): () => void {
    this._userSessionStartedListeners.push(listener);
    return () => {
      const i = this._userSessionStartedListeners.indexOf(listener);
      if (i !== -1) {
        this._userSessionStartedListeners.splice(i, 1);
      }
    };
  }

  public addUserSessionEndedListener(listener: () => void): () => void {
    this._userSessionEndedListeners.push(listener);
    return () => {
      const i = this._userSessionEndedListeners.indexOf(listener);
      if (i !== -1) {
        this._userSessionEndedListeners.splice(i, 1);
      }
    };
  }

  public getSessionPartId(): string | null {
    return this._activeSessionPartId;
  }

  public getSessionPartStartTime(): HrTime | null {
    return this._activeSessionPartStartTime;
  }

  public getSessionPartSpan(): ExtendedSpan | null {
    return this._sessionPartSpan;
  }

  public startSessionPart(reason: SessionPartStartReason = 'init'): void {
    if (this._sessionPartSpan) {
      this.endSessionPartInternal('manual');
    }

    // Parts are foreground-only: a part corresponds to a tab that is both
    // visible AND the most recently focused window.
    if (
      getVisibilityState(this._visibilityDoc) === EMB_STATES.Background ||
      !this._visibilityDoc.hasFocus()
    ) {
      this._diag.debug(
        `skipping session part start (reason: ${reason}) because the tab is not engaged`,
      );
      return;
    }

    const activeSessionPartId = generateUUID();
    const activeSessionPartStartTime = this._perf.getNowHRTime();
    const previouslyRecordedCounts = this._nextSessionPartCounts;

    const userSessionAttrs = this._beginUserSessionForPartStart();
    // session.id is stamped at onEnd so setSessionId() calls made during
    // the part are reflected on the exported span.
    const { [ATTR_SESSION_ID]: _sessionId, ...userSessionAttrsForSpan } =
      userSessionAttrs;

    const attributes: Attributes = {
      ...this._getPermanentAttributes(),
      // Defensive overlay: user-session-scoped values shadow permanent
      // values for any key that was flipped between scopes.
      ...Object.fromEntries(this._userSessionProperties),
      ...userSessionAttrsForSpan,
      [KEY_EMB_TYPE]: EMB_TYPES.SessionPart,
      [KEY_EMB_STATE]: EMB_STATES.Foreground,
      [KEY_EMB_SESSION_PART_ID]: activeSessionPartId,
      [KEY_EMB_SESSION_PART_START_REASON]: reason,
      [KEY_EMB_COLD_START]: this._coldStart,
      ...previouslyRecordedCounts,
    };

    // Commit the part id before startSpan so synchronous processor onStart
    // hooks observe an active part. Roll back on throw so the invariant
    // "non-null id implies non-null span" holds.
    this._activeSessionPartId = activeSessionPartId;
    let span: EmbraceExtendedSpan;
    try {
      span = new EmbraceExtendedSpan(
        this._tracer.startSpan('emb-session', { attributes }),
      );
    } catch (error) {
      this._activeSessionPartId = null;
      throw error;
    }

    this._activeSessionPartStartTime = activeSessionPartStartTime;
    this._activeSessionPartCounts = {};
    this._nextSessionPartCounts = {};
    this._sessionPartSpan = span;
    this._coldStart = false;

    for (const listener of this._sessionPartStartedListeners) {
      try {
        listener();
      } catch (error) {
        this._diag.warn(
          'Error while executing session part started listener',
          error,
        );
      }
    }
  }

  public endSessionPart(): void {
    this.endSessionPartInternal('manual');
  }

  public endSessionPartInternal(
    reason: SessionPartEndReason,
    terminationInfo?: TerminationInfo,
  ): void {
    if (!this._sessionPartSpan) {
      this._diag.debug(
        'trying to end a session part, but there is no session part in progress. This is a no-op.',
      );
      return;
    }

    for (const listener of this._sessionPartEndedListeners) {
      try {
        listener();
      } catch (error) {
        this._diag.warn(
          'Error while executing session part ended listener',
          error,
        );
      }
    }

    // Spec 1.1: the inactivity deadline is computed from the part end, not
    // from after the SpanProcessor.onEnd chain completes.
    const partEndTs = this._perf.getNowMillis();
    const span = this._sessionPartSpan;
    try {
      const endAttrs = this._endSessionPartAttributes(reason);
      if (terminationInfo) {
        endAttrs[KEY_EMB_IS_FINAL_SESSION_PART] = 1;
        this._userSessionProperties.clear();
        if (terminationInfo.reason) {
          endAttrs[KEY_EMB_USER_SESSION_TERMINATION_REASON] =
            terminationInfo.reason;
        }
      }

      try {
        span.setAttributes(endAttrs);
      } catch (error) {
        this._diag.warn(
          'Error setting end attributes on session part span; ending span without them',
          error,
        );
      }
    } catch (error) {
      this._diag.warn(
        'Error building session part end attributes; span will end without them',
        error,
      );
    } finally {
      try {
        span.end(partEndTs);
      } catch (error) {
        this._diag.warn('Error ending session part span', error);
      }
      this._sessionPartSpan = null;
      this._activeSessionPartStartTime = null;
      this._activeSessionPartId = null;
      this._activeSessionPartCounts = null;
      this._limitManager?.reset();
    }

    if (!terminationInfo) {
      try {
        this._continueUserSessionAfterPartEnd(partEndTs);
      } catch (error) {
        this._diag.warn('Error continuing user session after part end', error);
      }
    }
  }

  public addBreadcrumb(name: string): void {
    if (!this._sessionPartSpan) {
      this._diag.debug(
        'trying to add breadcrumb, but there is no session part in progress. This is a no-op.',
      );
      return;
    }
    if (!this._limitManager) {
      this._diag.debug('addBreadcrumb requires a limitManager; no-op.');
      return;
    }
    const limitedBreadcrumb = this._limitManager.limitBreadcrumb(name);
    if (limitedBreadcrumb === 'dropped') {
      return;
    }
    this._sessionPartSpan.addEvent(
      'emb-breadcrumb',
      { message: limitedBreadcrumb.name },
      this._perf.getNowMillis(),
    );
  }

  public addProperty(
    propertyKey: string,
    value: string,
    options?: PropertyOptions,
  ): void {
    if (!this._limitManager) {
      this._diag.debug('addProperty requires a limitManager; no-op.');
      return;
    }
    const limitedSessionProperty = this._limitManager.limitSessionProperty(
      propertyKey,
      value,
    );
    if (limitedSessionProperty === 'dropped') {
      return;
    }

    const attributeKey = KEY_PREFIX_EMB_PROPERTIES + limitedSessionProperty.key;

    if (options?.lifespan === 'permanent') {
      // Strip any non-permanent entry for the same key so the two stores
      // cannot disagree after a flip.
      this._userSessionProperties.delete(attributeKey);
      const persisted = this._storage.write(
        attributeKey,
        limitedSessionProperty.value,
      );
      if (!persisted) {
        this._userSessionProperties.set(
          attributeKey,
          limitedSessionProperty.value,
        );
      }
    } else {
      this._userSessionProperties.set(
        attributeKey,
        limitedSessionProperty.value,
      );
    }

    if (this._sessionPartSpan) {
      this._sessionPartSpan.setAttribute(
        attributeKey,
        limitedSessionProperty.value,
      );
    }
  }

  public removeProperty(propertyKey: string): void {
    if (!this._limitManager) {
      this._diag.debug('removeProperty requires a limitManager; no-op.');
      return;
    }
    const attributeKey =
      KEY_PREFIX_EMB_PROPERTIES +
      this._limitManager.truncateString('session_property_key', propertyKey);

    // Remove from both stores unconditionally so a key that was flipped
    // between scopes doesn't linger in the other one.
    this._userSessionProperties.delete(attributeKey);
    if (this._storage.has(attributeKey)) {
      this._storage.remove(attributeKey);
    }

    if (this._sessionPartSpan) {
      this._sessionPartSpan.removeAttribute(attributeKey);
    }
  }

  public incrSessionPartCountForKey(key: string): void {
    if (!this._sessionPartSpan || !this._activeSessionPartCounts) {
      this._diag.debug(
        'trying to increment a count for the active session part, but there is no session part in progress. This is a no-op.',
      );
      return;
    }
    this._activeSessionPartCounts[key] =
      (this._activeSessionPartCounts[key] || 0) + 1;
  }

  public incrNextSessionPartCountForKey(key: string): void {
    this._nextSessionPartCounts[key] =
      (this._nextSessionPartCounts[key] || 0) + 1;
  }

  public addSessionPartStartedListener(
    listener: SessionPartStartedListener,
  ): () => void {
    this._sessionPartStartedListeners.push(listener);
    return () => {
      const i = this._sessionPartStartedListeners.indexOf(listener);
      if (i !== -1) {
        this._sessionPartStartedListeners.splice(i, 1);
      }
    };
  }

  public addSessionPartEndedListener(
    listener: SessionPartEndedListener,
  ): () => void {
    this._sessionPartEndedListeners.push(listener);
    return () => {
      const i = this._sessionPartEndedListeners.indexOf(listener);
      if (i !== -1) {
        this._sessionPartEndedListeners.splice(i, 1);
      }
    };
  }

  public getSessionId(): string | null {
    return this.getUserSessionId();
  }

  public getPreviousSessionId(): string | null {
    return this.getPreviousUserSessionId();
  }

  public getSessionStartTime(): HrTime | null {
    const ms = this.getUserSessionStartTime();
    if (ms === null) {
      return null;
    }
    const seconds = Math.floor(ms / 1000);
    const nanoseconds = (ms % 1000) * 1_000_000;
    return [seconds, nanoseconds];
  }

  public endSessionSpan(): void {
    this.endUserSession();
  }

  public getSessionSpan(): ExtendedSpan | null {
    return null;
  }

  public addSessionStartedListener(listener: () => void): () => void {
    return this.addUserSessionStartedListener(listener);
  }

  public addSessionEndedListener(listener: () => void): () => void {
    return this.addUserSessionEndedListener(listener);
  }

  private readonly _onStorage = (event: StorageEvent): void => {
    if (event.key !== this._storageEventKey) {
      return;
    }

    const stored = this._readState();

    const oldUserSessionId = this._state?.userSessionId ?? null;
    const newUserSessionId = stored?.userSessionId ?? null;

    if (oldUserSessionId === newUserSessionId) {
      // Same session, peer bumped a counter; resync in-memory.
      this._state = stored;
      return;
    }

    // In-memory cutover before finalizing the dying part: spec 2.1 wants
    // reads during span finalization to see the new state.
    if (oldUserSessionId !== null) {
      this._previousUserSessionId = oldUserSessionId;
    }
    this._clearMaxDurationTimer();
    this._state = stored;

    const corrupted = this._consumeCorruptionMarker();

    try {
      this.endSessionPartInternal('user_session_ended', {
        isFinal: true,
        reason: corrupted ? 'storage_corrupted' : null,
      });
    } catch (e) {
      this._diag.warn(
        'Error finalizing part during external session change',
        e,
      );
    }

    if (stored !== null) {
      const localNow = this._perf.getNowMillis();
      if (this._isExpired(stored, localNow)) {
        this._diag.warn(
          'Adopted cross-tab user session is already expired locally; skipping max-duration timer (likely clock skew).',
        );
      } else {
        this._setupMaxDurationTimer(stored, localNow);
      }
    }

    try {
      if (oldUserSessionId !== null) {
        this._notifyUserSessionEndedListeners();
      }
      if (newUserSessionId !== null) {
        this._notifyUserSessionStartedListeners();
      }
    } catch (e) {
      this._diag.warn(
        'Error notifying user-session listeners on storage event',
        e,
      );
    }
  };

  /**
   * Reads any persisted state, expires it if needed, increments the part
   * counter, and arms the max-duration timer. Returns the user-session
   * attributes to stamp on the new part span.
   */
  private _beginUserSessionForPartStart(): UserSessionAttributes {
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
      // localStorage is not transactional. Guard on userSessionId equality so
      // we never adopt a stranger session mid-start.
      const stored = this._readState();
      if (
        stored &&
        stored.userSessionId === state.userSessionId &&
        stored.userSessionPartNumber > state.userSessionPartNumber
      ) {
        state = stored;
      }
    }

    state = {
      ...state,
      userSessionPartNumber: state.userSessionPartNumber + 1,
    };
    this._writeState(state);
    this._state = state;
    // Spec 1.1: a part is active, so the inactivity deadline no longer
    // applies. Cleared AFTER _writeState so concurrent peers never observe
    // the deadline gone while the row still shows the prior part number.
    this._clearInactivityDeadline();
    this._setupMaxDurationTimer(state, now);

    if (isNewSession) {
      this._notifyUserSessionStartedListeners();
    }

    return this._buildUserSessionAttributes(state);
  }

  /**
   * Records the inactivity deadline (spec 1.1) on the dedicated storage
   * key so the next part start can detect lazy expiry. The deadline lives
   * in its own key, not folded into the main state row, so a part-end
   * write cannot clobber a peer's part-number bump in the row.
   */
  private _continueUserSessionAfterPartEnd(partEndTs: number): void {
    if (!this._state) {
      this._clearMaxDurationTimer();
      return;
    }

    // Resync in-memory _state with any peer part-number bump.
    const stored = this._readState();
    if (stored && stored.userSessionId === this._state.userSessionId) {
      this._state = stored;
    }

    const deadline = partEndTs + this._state.inactivityTimeoutMs;
    this._writeInactivityDeadline(deadline);

    // Spec 1.3: the user-session max-duration timer must fire even while
    // no part is active.
    this._setupMaxDurationTimer(this._state, this._perf.getNowMillis());
  }

  /**
   * Drives the user-session-end sequence: ends the active part with the
   * given termination info, fires ended-listeners, clears in-memory and
   * stored state, and starts a fresh part for the next user session. Used
   * by manual endUserSession, max-duration expiry, and the cross-tab
   * cascade caller (which has already cleared state).
   */
  private _terminateSession(terminationInfo: TerminationInfo): void {
    try {
      this.endSessionPartInternal('user_session_ended', terminationInfo);
    } catch (e) {
      this._diag.warn('Error finalizing part during session termination', e);
    }

    // Fire ended-listeners before clearing _state so listeners can still
    // read getUserSessionId().
    try {
      this._notifyUserSessionEndedListeners();
    } finally {
      this._previousUserSessionId = this._state?.userSessionId ?? null;
      this._state = null;
      this._clearStoredState();
    }

    try {
      this.startSessionPart('user_session_rollover');
    } catch (e) {
      this._diag.warn('Error starting part during session termination', e);
    }
  }

  private _setupMaxDurationTimer(state: UserSessionState, now: number): void {
    this._clearMaxDurationTimer();

    const remaining = state.userSessionMaxEndTs - now;
    if (remaining <= 0) {
      return;
    }

    this._maxDurationTimeout = setTimeout(() => {
      this._maxDurationTimeout = null;
      this._terminateSession({
        isFinal: true,
        reason: 'max_duration_reached',
      });
    }, remaining);
  }

  private _clearMaxDurationTimer(): void {
    if (this._maxDurationTimeout !== null) {
      clearTimeout(this._maxDurationTimeout);
      this._maxDurationTimeout = null;
    }
  }

  private _isExpired(state: UserSessionState, now: number): boolean {
    // Spec 6.1: if the device clock jumped backwards before the recorded
    // session start, treat the session as expired and start a fresh one.
    if (now < state.userSessionStartTs) {
      return true;
    }
    if (now >= state.userSessionMaxEndTs) {
      return true;
    }
    // Inactivity only applies once a part has ended (the deadline key is
    // written then and cleared on the next part start). While a part is
    // active the key is absent, so inactivity cannot expire the session
    // mid-part; only max-duration can.
    const deadline = this._readInactivityDeadline();
    return deadline !== null && now >= deadline;
  }

  private _createSession(now: number): UserSessionState {
    const userSessionNumber = getIncrementedCount(
      this._storage,
      EMBRACE_USER_SESSION_NUMBER_KEY,
      this._diag,
    );
    return {
      userSessionId: generateUUID(),
      previousUserSessionId: this._previousUserSessionId,
      userSessionStartTs: now,
      userSessionMaxEndTs: now + this._maxDurationMs,
      userSessionNumber,
      userSessionPartNumber: 0,
      // Lock the config in for this session's lifetime (spec 3, edge case 2).
      maxDurationMs: this._maxDurationMs,
      inactivityTimeoutMs: this._inactivityTimeoutMs,
    };
  }

  private _buildUserSessionAttributes(
    state: UserSessionState,
  ): UserSessionAttributes {
    return {
      [ATTR_SESSION_ID]: this._userSessionIdOverride ?? state.userSessionId,
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

  private _notifyUserSessionStartedListeners(): void {
    for (const listener of this._userSessionStartedListeners) {
      try {
        listener();
      } catch (e) {
        this._diag.warn('Error in user session started listener', e);
      }
    }
  }

  private _notifyUserSessionEndedListeners(): void {
    for (const listener of this._userSessionEndedListeners) {
      try {
        listener();
      } catch (e) {
        this._diag.warn('Error in user session ended listener', e);
      }
    }
  }

  private _clampMs(
    name: string,
    seconds: number | undefined,
    defaultMs: number,
    minMs: number,
    maxMs: number,
  ): number {
    if (seconds === undefined) {
      return defaultMs;
    }
    if (!Number.isFinite(seconds)) {
      this._diag.warn(
        `${name} is not a finite number; falling back to default (${(defaultMs / 1000).toString()}s).`,
      );
      return defaultMs;
    }
    const ms = seconds * 1000;
    if (ms < minMs || ms > maxMs) {
      this._diag.warn(
        `${name} (${seconds.toString()}s) is outside the allowed range ` +
          `[${(minMs / 1000).toString()}s, ${(maxMs / 1000).toString()}s]; ` +
          `falling back to default (${(defaultMs / 1000).toString()}s).`,
      );
      return defaultMs;
    }
    return ms;
  }

  private _getPermanentAttributes(): Attributes {
    const permanentAttributes: Record<string, string> = {};
    if (this._storage.isDisabled()) {
      return permanentAttributes;
    }
    for (const key of this._storage.keys()) {
      if (key.startsWith(KEY_PREFIX_EMB_PROPERTIES)) {
        const value = this._storage.read(key);
        if (value) {
          permanentAttributes[key] = value;
        }
      }
    }
    return permanentAttributes;
  }

  private _endSessionPartAttributes(reason: SessionPartEndReason): Attributes {
    return {
      ...this._getPermanentAttributes(),
      [KEY_EMB_SESSION_PART_END_REASON]: reason,
      ...this._activeSessionPartCounts,
      ...(this._limitManager?.getDiagnosticCounts() ?? {}),
      [KEY_EMB_SDK_STARTUP_DURATION]: this._sdkStartupDuration,
    };
  }

  private _consumeCorruptionMarker(): boolean {
    if (!this._storage.has(EMBRACE_USER_SESSION_CORRUPT_MARKER_KEY)) {
      return false;
    }
    this._storage.remove(EMBRACE_USER_SESSION_CORRUPT_MARKER_KEY);
    this._diag.warn(
      'Cross-tab cascade triggered by storage corruption detected in another tab',
    );
    return true;
  }

  private _clearStoredState(): void {
    this._storage.remove(EMBRACE_USER_SESSION_STATE_KEY);
    // A stale deadline outliving a session-rollover would be applied to
    // the next session.
    this._clearInactivityDeadline();
  }

  private _readInactivityDeadline(): number | null {
    if (this._storage.isDisabled()) {
      return this._inMemoryInactivityDeadline;
    }
    const raw = this._storage.read(
      EMBRACE_USER_SESSION_INACTIVITY_DEADLINE_KEY,
    );
    if (raw === null) {
      return null;
    }
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private _writeInactivityDeadline(deadline: number): void {
    // Max-merge: only overwrite if our deadline is later than the stored
    // one. The deadline is monotonically non-decreasing within a user
    // session (each part-end recomputes it as `now + timeout`, and `now`
    // is monotonic), so a stale write from a slower tab cannot represent
    // a more recent activity than what is already there. Skipping
    // backwards-going writes also reduces the storage-event traffic peer
    // tabs need to process.
    if (this._storage.isDisabled()) {
      const existing = this._inMemoryInactivityDeadline;
      if (existing === null || deadline > existing) {
        this._inMemoryInactivityDeadline = deadline;
      }
      return;
    }
    const existing = this._readInactivityDeadline();
    if (existing !== null && existing >= deadline) {
      return;
    }
    const persisted = this._storage.write(
      EMBRACE_USER_SESSION_INACTIVITY_DEADLINE_KEY,
      String(deadline),
    );
    if (!persisted) {
      this._inMemoryInactivityDeadline = deadline;
    }
  }

  private _clearInactivityDeadline(): void {
    this._inMemoryInactivityDeadline = null;
    this._storage.remove(EMBRACE_USER_SESSION_INACTIVITY_DEADLINE_KEY);
  }

  private _readState(): UserSessionState | null {
    if (this._storage.isDisabled()) {
      return this._state;
    }
    const raw = this._storage.read(EMBRACE_USER_SESSION_STATE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const state = JSON.parse(raw) as UserSessionState;
      if (!this._isValidPersistedState(state)) {
        throw new Error(
          'persisted user session state failed structural validation',
        );
      }
      return state;
    } catch (e) {
      this._diag.error(
        'User session state in storage is corrupt; discarding it',
        e,
      );
      // Marker is set BEFORE the clear so peer tabs can correlate the
      // resulting cross-tab cascade with this corruption event.
      this._storage.write(EMBRACE_USER_SESSION_CORRUPT_MARKER_KEY, '1');
      this._clearStoredState();
      return null;
    }
  }

  private _writeState(state: UserSessionState): void {
    if (this._storage.isDisabled()) {
      return;
    }
    this._storage.write(EMBRACE_USER_SESSION_STATE_KEY, JSON.stringify(state));
  }

  private _isValidPersistedState(state: UserSessionState): boolean {
    if (typeof state.userSessionId !== 'string' || state.userSessionId === '') {
      return false;
    }
    if (
      state.previousUserSessionId !== null &&
      (typeof state.previousUserSessionId !== 'string' ||
        state.previousUserSessionId === '')
    ) {
      return false;
    }
    if (
      !Number.isFinite(state.userSessionStartTs) ||
      !Number.isFinite(state.userSessionMaxEndTs) ||
      !Number.isFinite(state.userSessionNumber) ||
      !Number.isFinite(state.userSessionPartNumber) ||
      state.userSessionPartNumber < 0 ||
      !Number.isFinite(state.maxDurationMs) ||
      !Number.isFinite(state.inactivityTimeoutMs)
    ) {
      return false;
    }
    return true;
  }
}
