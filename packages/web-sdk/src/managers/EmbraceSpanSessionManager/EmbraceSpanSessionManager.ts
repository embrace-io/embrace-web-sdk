import type {
  Attributes,
  DiagLogger,
  Tracer,
  TracerProvider,
} from '@opentelemetry/api';
import { diag, trace } from '@opentelemetry/api';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import type {
  PropertyOptions,
  SessionPartEndReason,
  SessionPartStartReason,
  UserSessionEndReason,
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
import type { PerformanceManager } from '../../utils/index.ts';
import {
  EmbraceStorage,
  generateUUID,
  getIncrementedCount,
  getVisibilityState,
  OTelPerformanceManager,
} from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';
import { EmbraceExtendedSpan } from '../EmbraceTraceManager/EmbraceExtendedSpan.ts';
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
  EmbraceSpanSessionManagerArgs,
  SpanSessionManagerInternal,
  UserSessionAttributes,
  UserSessionState,
} from './types.ts';

/**
 * Parts are engagement-gated (visible AND focused), so only one tab can
 * have an active part at a time. That mutex lets us treat storage as a
 * plain shared row read on engagement and written on changes, with no
 * cross-tab event listener.
 */
export class EmbraceSpanSessionManager implements SpanSessionManagerInternal {
  private _state: UserSessionState | null = null;
  private _previousUserSessionId: string | null = null;
  private readonly _maxDurationMs: number;
  private readonly _inactivityTimeoutMs: number;
  private _maxDurationTimeout: ReturnType<typeof setTimeout> | null = null;
  private _lastEndUserSessionTs: number | null = null;
  private _userSessionIdOverride: string | null = null;
  // Tab-local fallback for user-session-scoped property writes that storage
  // could not persist (or had nowhere to persist yet, before _state exists).
  // Keys are already prefixed with KEY_PREFIX_EMB_PROPERTIES and length-
  // limited. Cleared at user-session end. _state.userSessionProperties is
  // the disk-backed view and wins for any shared key; this map only fills
  // gaps.
  private readonly _unpersistedProperties: Map<string, string> = new Map();

  private _activeSessionPartId: string | null = null;
  private _sessionPartSpan: ExtendedSpan | null = null;
  private _activeSessionPartCounts: Record<string, number> | null = null;
  // Stamped on the part span as emb.cold_start; flipped off on first start.
  private _coldStart = true;
  private _nextSessionPartCounts: Record<string, number> = {};
  private _sdkStartupDuration = 0;
  private readonly _sessionPartStartedListeners: Array<() => void> = [];
  private readonly _sessionPartEndedListeners: Array<() => void> = [];
  private _tracer: Tracer;

  private readonly _diag: DiagLogger;
  private readonly _perf: PerformanceManager;
  private readonly _storage: EmbraceStorage;
  private readonly _visibilityDoc: VisibilityStateDocument;
  private readonly _limitManager: LimitManagerInternal | null;

  public constructor({
    config,
    diag: diagParam,
    perf,
    visibilityDoc = window.document,
    storage,
    limitManager,
  }: EmbraceSpanSessionManagerArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceSpanSessionManager',
      });
    this._perf = perf ?? new OTelPerformanceManager();
    this._storage =
      storage ?? new EmbraceStorage(window.localStorage, this._diag);
    this._visibilityDoc = visibilityDoc;
    this._limitManager = limitManager ?? null;
    this._tracer = trace.getTracer('embrace-web-sdk-user-sessions');

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
  }

  public setTracerProvider(tracerProvider: TracerProvider): void {
    this._tracer = tracerProvider.getTracer('embrace-web-sdk-user-sessions');
  }

  public recordSDKStartupDuration(duration: number): void {
    this._sdkStartupDuration = Math.ceil(duration);
  }

  public getUserSessionId(): string | null {
    return this._state?.userSessionId ?? null;
  }

  public getPreviousUserSessionId(): string | null {
    // Fall back to in-memory for the brief window during user-session end
    // where storage is cleared but the just-ended id is still held.
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
    this._terminateUserSession('manual');
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
    if (id !== null && this._limitManager) {
      this._userSessionIdOverride = this._limitManager.truncateString(
        'session_id',
        id,
      );
      return;
    }
    this._userSessionIdOverride = id;
  }

  public getSessionPartId(): string | null {
    return this._activeSessionPartId;
  }

  public getSessionPartSpan(): ExtendedSpan | null {
    return this._sessionPartSpan;
  }

  public startSessionPartInternal(reason: SessionPartStartReason): void {
    if (this._sessionPartSpan) {
      this._diag.warn(
        `startSessionPartInternal called while a part is active (reason: ${reason}); ignoring`,
      );
      return;
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
    const previouslyRecordedCounts = this._nextSessionPartCounts;

    const userSessionAttrs = this._beginUserSessionForPartStart();
    // session.id is stamped at onEnd so setSessionId() calls made during
    // the part are reflected on the exported span.
    const { [ATTR_SESSION_ID]: _sessionId, ...userSessionAttrsForSpan } =
      userSessionAttrs;

    const attributes: Attributes = {
      ...this._getPropertiesForSessionPart(),
      ...userSessionAttrsForSpan,
      [KEY_EMB_TYPE]: EMB_TYPES.SessionPart,
      [KEY_EMB_STATE]: EMB_STATES.Foreground,
      [KEY_EMB_SESSION_PART_ID]: activeSessionPartId,
      [KEY_EMB_SESSION_PART_START_REASON]: reason,
      [KEY_EMB_COLD_START]: this._coldStart,
      ...previouslyRecordedCounts,
    };

    // Invariant: non-null part id implies non-null span.
    this._activeSessionPartId = activeSessionPartId;
    let span: EmbraceExtendedSpan;
    try {
      span = new EmbraceExtendedSpan(
        this._tracer.startSpan('emb-session', { attributes }),
      );
    } catch (error) {
      this._activeSessionPartId = null;
      this._diag.error('Error starting session part span', error);
      return;
    }

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

  public endSessionPartInternal(
    reason: SessionPartEndReason,
    userSessionEndReason?: UserSessionEndReason | null,
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

    const isFinal = reason === 'user_session_ended';

    // Spec 1.1: the inactivity deadline is computed from the part end, not
    // from after the SpanProcessor.onEnd chain completes.
    const partEndTs = this._perf.getNowMillis();
    const span = this._sessionPartSpan;
    try {
      // Pull the latest persisted user-session-scoped properties so values
      // written by another tab during this part land on the finalized span.
      this._refreshUserSessionPropertiesFromStorage();
      const endAttrs = this._endSessionPartInternalAttributes(reason);
      if (isFinal) {
        endAttrs[KEY_EMB_IS_FINAL_SESSION_PART] = 1;
        this._unpersistedProperties.clear();
        if (userSessionEndReason) {
          endAttrs[KEY_EMB_USER_SESSION_TERMINATION_REASON] =
            userSessionEndReason;
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
      this._activeSessionPartId = null;
      this._activeSessionPartCounts = null;
      this._limitManager?.reset();
    }

    if (!isFinal) {
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
      if (!this._storage.setItem(attributeKey, limitedSessionProperty.value)) {
        // Don't alias into session scope: the caller asked for permanence
        // and we can't deliver it.
        this._diag.warn(
          `Storage write failed; '${propertyKey}' was not stored.`,
        );
        return;
      }
      // Permanent write succeeded; strip any user-session-scoped entry so
      // the two stores cannot disagree after a flip.
      this._unpersistedProperties.delete(attributeKey);
      this._removeFromPersistedUserSessionProperties(attributeKey);
    } else if (
      this._state &&
      this._writePersistedUserSessionProperty(
        attributeKey,
        limitedSessionProperty.value,
      )
    ) {
      // Persist succeeded; _state was advanced by the helper. Drop any
      // stale fallback entry under the same key.
      this._unpersistedProperties.delete(attributeKey);
    } else {
      // Either no state row exists yet (pre-init buffer) or the persist
      // attempt failed. Stash in the fallback map; _state stays in sync
      // with disk.
      this._unpersistedProperties.set(
        attributeKey,
        limitedSessionProperty.value,
      );
      if (this._state) {
        this._diag.warn(
          `Storage write failed, so '${propertyKey}' will not be visible in other tabs.`,
        );
      }
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

    // Try every store so a key that was flipped between scopes doesn't
    // linger in the other one.
    this._unpersistedProperties.delete(attributeKey);
    const removedTopLevel = this._storage.removeItem(attributeKey);
    const removedSessionScoped =
      this._removeFromPersistedUserSessionProperties(attributeKey);
    if (!removedTopLevel || !removedSessionScoped) {
      this._diag.warn(
        `Storage write failed, '${propertyKey}' may still be visible in other tabs.`,
      );
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

  public addSessionPartStartedListener(listener: () => void): () => void {
    this._sessionPartStartedListeners.push(listener);
    return () => {
      const i = this._sessionPartStartedListeners.indexOf(listener);
      if (i !== -1) {
        this._sessionPartStartedListeners.splice(i, 1);
      }
    };
  }

  public addSessionPartEndedListener(listener: () => void): () => void {
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

  public getPreviousSessionId(): null {
    return null;
  }

  public getSessionStartTime(): number | null {
    return this.getUserSessionStartTime();
  }

  public endSessionSpan(): void {
    this.endUserSession();
  }

  public startSessionSpan(): void {}

  public getSessionSpan(): ExtendedSpan | null {
    return this.getSessionPartSpan();
  }

  public currentSessionAsReadableSpan(): null {
    return null;
  }

  public addSessionStartedListener(_listener: () => void): () => void {
    return () => {};
  }

  public addSessionEndedListener(_listener: () => void): () => void {
    return () => {};
  }

  /**
   * Reads any persisted state, expires it if needed, bumps the part
   * counter, and arms the max-duration timer. Returns the user-session
   * attributes to stamp on the new part span.
   */
  private _beginUserSessionForPartStart(): UserSessionAttributes {
    const now = this._perf.getNowMillis();
    let state = this._readState();

    if (!state || this._isExpired(state, now)) {
      if (state) {
        this._previousUserSessionId = state.userSessionId;
      }
      state = this._createSession(now);
    }

    state = {
      ...state,
      userSessionPartNumber: state.userSessionPartNumber + 1,
      // Spec 1.1: a part is active, so the inactivity deadline no longer
      // applies.
      inactivityDeadlineTs: null,
    };

    // Promote any tab-local fallback entries into the state row, but only
    // for keys disk doesn't already have: another tab's persisted write
    // is preferred over this tab's failed-write fallback.
    const promoted: Record<string, string> = {};
    for (const [k, v] of this._unpersistedProperties) {
      if (!(k in state.userSessionProperties)) {
        promoted[k] = v;
      }
    }
    const candidate: UserSessionState =
      Object.keys(promoted).length === 0
        ? state
        : {
            ...state,
            userSessionProperties: {
              ...state.userSessionProperties,
              ...promoted,
            },
          };

    if (this._writeState(candidate)) {
      state = candidate;
      for (const k of Object.keys(promoted)) {
        this._unpersistedProperties.delete(k);
      }
    }
    // If the persist failed we keep _state aligned with disk (no promoted
    // entries) and the fallback map retains them so they stay visible
    // locally via the read rule.

    this._state = state;
    this._setupMaxDurationTimer(state, now);

    return this._buildUserSessionAttributes(state);
  }

  /**
   * Records the inactivity deadline (spec 1.1) on the user-session row so
   * the next part start can detect lazy expiry.
   */
  private _continueUserSessionAfterPartEnd(partEndTs: number): void {
    if (!this._state) {
      this._clearMaxDurationTimer();
      return;
    }

    const updated: UserSessionState = {
      ...this._state,
      inactivityDeadlineTs: partEndTs + this._state.inactivityTimeoutMs,
    };
    this._writeState(updated);
    this._state = updated;

    // Spec 1.3: the user-session max-duration timer must fire even while
    // no part is active.
    this._setupMaxDurationTimer(updated, this._perf.getNowMillis());
  }

  /**
   * Ends the active part as final, clears state, and starts a fresh part
   * for the next user session. Used by manual endUserSession and
   * max-duration expiry.
   */
  private _terminateUserSession(
    userSessionEndReason: UserSessionEndReason,
  ): void {
    try {
      this.endSessionPartInternal('user_session_ended', userSessionEndReason);
    } catch (e) {
      this._diag.error('Error finalizing part during user session end', e);
    }

    this._previousUserSessionId = this._state?.userSessionId ?? null;
    this._state = null;
    this._clearStoredState();

    try {
      this.startSessionPartInternal('user_session_rollover');
    } catch (e) {
      this._diag.error('Error starting part during user session end', e);
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
      this._terminateUserSession('max_duration_reached');
    }, remaining);
  }

  /**
   * @internal Would be private but exposed for tests to simulate a page reload
   */
  public _clearMaxDurationTimer(): void {
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
    // Inactivity only applies once a part has ended; while a part is
    // active the deadline is null. Only max-duration can expire mid-part.
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
      previousUserSessionId: this._previousUserSessionId,
      userSessionStartTs: now,
      userSessionMaxEndTs: now + this._maxDurationMs,
      userSessionNumber,
      userSessionPartNumber: 0,
      // Lock the config in for this session's lifetime (spec 3, edge case 2).
      maxDurationMs: this._maxDurationMs,
      inactivityTimeoutMs: this._inactivityTimeoutMs,
      inactivityDeadlineTs: null,
      userSessionProperties: {},
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

  /**
   * User-session-scoped values shadow permanent values on key collision,
   * matching the cross-scope precedence enforced by `addProperty`. Within
   * the user-session scope, disk-backed values (from _state) win over the
   * tab-local fallback; the fallback only fills keys disk doesn't have.
   */
  private _getPropertiesForSessionPart(): Attributes {
    return {
      ...this._getPermanentAttributes(),
      ...Object.fromEntries(this._unpersistedProperties),
      ...(this._state?.userSessionProperties ?? {}),
    };
  }

  private _getPermanentAttributes(): Attributes {
    const permanentAttributes: Record<string, string> = {};
    if (this._storage.isWriteDisabled()) {
      return permanentAttributes;
    }
    for (const key of this._storage.keys()) {
      if (key.startsWith(KEY_PREFIX_EMB_PROPERTIES)) {
        const value = this._storage.getItem(key);
        if (value) {
          permanentAttributes[key] = value;
        }
      }
    }
    return permanentAttributes;
  }

  private _endSessionPartInternalAttributes(
    reason: SessionPartEndReason,
  ): Attributes {
    return {
      // The user-session-scoped mirror is refreshed by the caller before
      // these end-stamp attributes are built, so any cross-tab writes that
      // landed during the part are reflected here.
      ...this._getPropertiesForSessionPart(),
      [KEY_EMB_SESSION_PART_END_REASON]: reason,
      ...this._activeSessionPartCounts,
      ...(this._limitManager?.getDiagnosticCounts() ?? {}),
      [KEY_EMB_SDK_STARTUP_DURATION]: this._sdkStartupDuration,
    };
  }

  private _clearStoredState(): void {
    this._storage.removeItem(EMBRACE_USER_SESSION_STATE_KEY);
  }

  private _readState(): UserSessionState | null {
    if (this._storage.isWriteDisabled()) {
      return this._state;
    }
    const raw = this._storage.getItem(EMBRACE_USER_SESSION_STATE_KEY);
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
      this._clearStoredState();
      return null;
    }
  }

  private _writeState(state: UserSessionState): boolean {
    if (this._storage.isWriteDisabled()) {
      return false;
    }
    return this._storage.setItem(
      EMBRACE_USER_SESSION_STATE_KEY,
      JSON.stringify(state),
    );
  }

  /**
   * Attempts to persist a session-scoped property into the user-session
   * state row. Only mutates _state if the disk write succeeds, keeping
   * _state.userSessionProperties as a faithful mirror of disk.
   */
  private _writePersistedUserSessionProperty(
    attributeKey: string,
    value: string,
  ): boolean {
    if (!this._state) {
      return false;
    }
    const updated: UserSessionState = {
      ...this._state,
      userSessionProperties: {
        ...this._state.userSessionProperties,
        [attributeKey]: value,
      },
    };
    if (!this._writeState(updated)) {
      return false;
    }
    this._state = updated;
    return true;
  }

  /**
   * Pulls the latest disk-persisted user-session-scoped properties into
   * _state so cross-tab writes that landed during this part are visible
   * to end-of-part stamping. _unpersistedProperties is intentionally left
   * alone: it holds this tab's failed writes, which the read rule still
   * exposes locally as a fallback.
   */
  private _refreshUserSessionPropertiesFromStorage(): void {
    if (!this._state) {
      return;
    }
    const persisted = this._readState();
    if (!persisted) {
      // State was cleared or corrupted between part start and part end.
      // Keep the in-memory snapshot rather than wiping it.
      return;
    }
    this._state = {
      ...this._state,
      userSessionProperties: persisted.userSessionProperties,
    };
  }

  /**
   * Returns true when the key was already absent from the state row, or
   * when the removal both updated _state and persisted to disk. Returns
   * false when the disk write failed; _state is left untouched in that
   * case so it keeps mirroring disk.
   */
  private _removeFromPersistedUserSessionProperties(
    attributeKey: string,
  ): boolean {
    if (!this._state || !(attributeKey in this._state.userSessionProperties)) {
      return true;
    }
    const next = { ...this._state.userSessionProperties };
    delete next[attributeKey];
    const candidate: UserSessionState = {
      ...this._state,
      userSessionProperties: next,
    };
    if (!this._writeState(candidate)) {
      return false;
    }
    this._state = candidate;
    return true;
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
    if (
      state.inactivityDeadlineTs !== null &&
      !Number.isFinite(state.inactivityDeadlineTs)
    ) {
      return false;
    }
    if (
      state.userSessionProperties === null ||
      typeof state.userSessionProperties !== 'object' ||
      Array.isArray(state.userSessionProperties)
    ) {
      return false;
    }
    for (const value of Object.values(state.userSessionProperties)) {
      if (typeof value !== 'string') {
        return false;
      }
    }
    return true;
  }
}
