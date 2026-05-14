import type {
  Attributes,
  DiagLogger,
  Tracer,
  TracerProvider,
} from '@opentelemetry/api';
import { diag, trace } from '@opentelemetry/api';
import {
  ATTR_SESSION_ID,
  ATTR_SESSION_PREVIOUS_ID,
} from '@opentelemetry/semantic-conventions/incubating';
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
  KEY_EMB_SESSION_PART_NUMBER,
  KEY_EMB_SESSION_PART_START_REASON,
  KEY_EMB_STATE,
  KEY_EMB_TYPE,
  KEY_EMB_USER_SESSION_ID,
  KEY_EMB_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS,
  KEY_EMB_USER_SESSION_MAX_DURATION_SECONDS,
  KEY_EMB_USER_SESSION_NUMBER,
  KEY_EMB_USER_SESSION_PART_INDEX,
  KEY_EMB_USER_SESSION_PREVIOUS_ID,
  KEY_EMB_USER_SESSION_START_TS,
  KEY_EMB_USER_SESSION_TERMINATION_REASON,
  KEY_PREFIX_EMB_PROPERTIES,
} from '../../constants/index.ts';
import type { ExtendedSpan } from '../../index.ts';
import type {
  NamespacedStorage,
  PerformanceManager,
  TimeoutRef,
} from '../../utils/index.ts';
import {
  clampNumber,
  generateUUID,
  getIncrementedCount,
  getVisibilityState,
  throttle,
} from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';
import { EmbraceExtendedSpan } from '../EmbraceTraceManager/EmbraceExtendedSpan.ts';
import {
  DEFAULT_ACTIVITY_EVENTS,
  DEFAULT_ACTIVITY_THROTTLE_MS,
  DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS,
  DEFAULT_USER_SESSION_MAX_DURATION_SECONDS,
  EMBRACE_LAST_END_USER_SESSION_TS_KEY,
  EMBRACE_SESSION_PART_NUMBER_KEY,
  EMBRACE_USER_SESSION_NUMBER_KEY,
  EMBRACE_USER_SESSION_STATE_KEY,
  END_USER_SESSION_COOLDOWN_MS,
  MAX_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS,
  MAX_USER_SESSION_MAX_DURATION_SECONDS,
  MIN_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS,
  MIN_USER_SESSION_MAX_DURATION_SECONDS,
  SESSION_PART_SPAN_NAME,
} from './constants.ts';
import type {
  EmbraceSpanSessionManagerArgs,
  SpanSessionManagerInternal,
  UserSessionAttributes,
  UserSessionState,
} from './types.ts';
import {
  addActivityListeners,
  createUserSessionState,
  isTabEngaged,
  isUserSessionExpired,
  readPermanentProperties,
  readUserSessionState,
  removeActivityListeners,
  storePermanentProperties,
} from './utils/index.ts';

/**
 * Parts are engagement-gated (visible AND focused), so only one part can
 * be active at a time. That mutex lets us treat storage as a
 * plain shared row read on engagement and written on changes.
 */
export class EmbraceSpanSessionManager implements SpanSessionManagerInternal {
  private _state: UserSessionState | null = null;
  private _previousUserSessionId: string | null = null;
  private readonly _maxUserSessionDurationSeconds: number;
  private readonly _inactivityTimeoutSeconds: number;
  private _maxDurationTimeout: ReturnType<typeof setTimeout> | null = null;
  // In-memory mirror of the embrace_permanent_properties blob. Bare keys;
  // the wire-format prefix is applied by the consumer at stamp time.
  private _permanentProperties: Record<string, string> = {};
  // Set to true the first time we successfully store the user-session
  // state row, so _continueUserSessionAfterPartEnd can distinguish "another
  // tab wiped storage after we wrote" (drop in-memory state) from "we never
  // managed to write" (keep in-memory state).
  private _hasStoredState = false;

  private _activeSessionPartId: string | null = null;
  // Storage-backed monotonic counter snapshotted at part start so that a
  // concurrent part start in another tab doesn't shift this part's value
  // before its span ends.
  private _currentSessionPartNumber: number | null = null;
  private _sessionPartSpan: ExtendedSpan | null = null;
  private _activeSessionPartCounts: Record<string, number> | null = null;
  // Flipped off once the first part starts within this page lifetime.
  private _coldStart = true;
  private _nextSessionPartCounts: Record<string, number> = {};
  private _sdkStartupDuration = 0;
  private readonly _sessionPartStartedListeners: Array<() => void> = [];
  private readonly _sessionPartEndedListeners: Array<() => void> = [];
  private _tracer: Tracer;

  private readonly _diag: DiagLogger;
  private readonly _perf: PerformanceManager;
  private readonly _storage: NamespacedStorage;
  private readonly _visibilityDoc: VisibilityStateDocument;
  private readonly _limitManager: LimitManagerInternal;
  private readonly _target: EventTarget;
  private readonly _activityEvents: ReadonlyArray<string>;
  private readonly _onActivityThrottled: (event: Event) => void;
  private _sessionPartInactivityTimer: TimeoutRef | null = null;

  public constructor({
    config,
    diag: diagParam,
    perf,
    visibilityDoc,
    storage,
    limitManager,
    target = window,
    activityThrottleMs = DEFAULT_ACTIVITY_THROTTLE_MS,
    activityEvents = DEFAULT_ACTIVITY_EVENTS,
  }: EmbraceSpanSessionManagerArgs) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceSpanSessionManager',
      });
    this._perf = perf;
    this._visibilityDoc = visibilityDoc;
    this._storage = storage;
    this._limitManager = limitManager;
    this._permanentProperties = readPermanentProperties(
      this._storage,
      this._diag,
    );
    this._tracer = trace.getTracer('embrace-web-sdk-session-parts');
    this._target = target;
    this._activityEvents = activityEvents;
    this._onActivityThrottled = throttle(this._onActivity, activityThrottleMs);

    const maxUserSessionDurationSeconds = clampNumber({
      diag: this._diag,
      value: config?.maxUserSessionDurationSeconds,
      defaultValue: DEFAULT_USER_SESSION_MAX_DURATION_SECONDS,
      min: MIN_USER_SESSION_MAX_DURATION_SECONDS,
      max: MAX_USER_SESSION_MAX_DURATION_SECONDS,
    });
    const inactivityTimeoutSeconds = clampNumber({
      diag: this._diag,
      value: config?.inactivityTimeoutSeconds,
      defaultValue: DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS,
      min: MIN_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS,
      max: MAX_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS,
    });

    this._maxUserSessionDurationSeconds = maxUserSessionDurationSeconds;
    if (inactivityTimeoutSeconds <= maxUserSessionDurationSeconds) {
      this._inactivityTimeoutSeconds = inactivityTimeoutSeconds;
    } else {
      this._diag.warn(
        `inactivityTimeoutSeconds (${inactivityTimeoutSeconds.toString()}s) ` +
          `exceeds maxUserSessionDurationSeconds (${maxUserSessionDurationSeconds.toString()}s); ` +
          `falling back to default inactivity timeout (${DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS.toString()}s).`,
      );
      this._inactivityTimeoutSeconds =
        DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS;
    }
  }

  public setTracerProvider(tracerProvider: TracerProvider): void {
    this._tracer = tracerProvider.getTracer('embrace-web-sdk-session-parts');
    // Listeners attach here rather than in the constructor so that tests
    // that construct a manager without going through SDK init don't
    // pollute window with listeners, and so that browser-activity-driven
    // parts only start once a real tracer is wired.
    addActivityListeners({
      target: this._target,
      visibilityDoc: this._visibilityDoc,
      activityEvents: this._activityEvents,
      onActivity: this._onActivityThrottled,
      onVisibilityChange: this._onVisibilityChange,
      onFocus: this._onFocus,
      onBlur: this._onBlur,
      onPageShow: this._onPageShow,
      onPageHide: this._onPageHide,
    });
    // Eager state init so getUserSessionId() returns a real id before the
    // first part starts. If on-disk state is still valid this is a no-op;
    // if expired (browser closed past the inactivity deadline) we create
    // a fresh session and store it so other tabs see it before the
    // first part starts.
    const { created } = this._loadOrCreateUserSessionState(
      this._perf.getNowMillis(),
    );
    if (created) {
      this._storeState();
    }
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
    const previousUserSessionId = this.getPreviousUserSessionId() ?? '';
    return {
      [KEY_EMB_USER_SESSION_ID]: this._state.userSessionId,
      [ATTR_SESSION_ID]: this._state.userSessionId,
      [KEY_EMB_USER_SESSION_PREVIOUS_ID]: previousUserSessionId,
      [ATTR_SESSION_PREVIOUS_ID]: previousUserSessionId,
      [KEY_EMB_USER_SESSION_NUMBER]: this._state.userSessionNumber,
      [KEY_EMB_USER_SESSION_PART_INDEX]: this._state.userSessionPartIndex,
      [KEY_EMB_SESSION_PART_NUMBER]: this._currentSessionPartNumber ?? 0,
      [KEY_EMB_USER_SESSION_START_TS]: this._state.userSessionStartTs,
      [KEY_EMB_USER_SESSION_MAX_DURATION_SECONDS]:
        this._state.maxUserSessionDurationSeconds,
      [KEY_EMB_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS]:
        this._state.inactivityTimeoutSeconds,
    };
  }

  public endUserSession(): void {
    if (!this._state) {
      this._diag.debug(
        'Trying to end user session, but there is no active session. This is a no-op.',
      );
      return;
    }

    const now = this._perf.getNowMillis();
    const lastEndRaw = this._storage.getItem(
      EMBRACE_LAST_END_USER_SESSION_TS_KEY,
    );
    const lastEndTs = lastEndRaw === null ? NaN : Number(lastEndRaw);
    if (
      Number.isFinite(lastEndTs) &&
      now - lastEndTs < END_USER_SESSION_COOLDOWN_MS
    ) {
      this._diag.warn(
        'endUserSession called within cooldown period, ignoring.',
      );
      return;
    }

    this._storage.setItem(EMBRACE_LAST_END_USER_SESSION_TS_KEY, String(now));
    this._rolloverUserSession('manual');
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
    // visible AND focused.
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

    this._beginUserSessionForPartStart();

    const attributes: Attributes = {
      ...this.getUserSessionAttributes(),
      [KEY_EMB_TYPE]: EMB_TYPES.SessionPart,
      [KEY_EMB_STATE]: EMB_STATES.Foreground,
      [KEY_EMB_SESSION_PART_ID]: activeSessionPartId,
      [KEY_EMB_SESSION_PART_START_REASON]: reason,
      [KEY_EMB_COLD_START]: this._coldStart,
      ...previouslyRecordedCounts,
    };

    this._activeSessionPartId = activeSessionPartId;
    let span: EmbraceExtendedSpan;
    try {
      span = new EmbraceExtendedSpan(
        this._tracer.startSpan(SESSION_PART_SPAN_NAME, { attributes }),
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

    this._startSessionPartInactivityTimer();

    this._fireListeners(this._sessionPartStartedListeners, 'started');
  }

  public endSessionPartInternal(
    reason: SessionPartEndReason,
    userSessionEndReason?: UserSessionEndReason | null,
    endTs?: number,
  ): void {
    if (!this._sessionPartSpan) {
      this._diag.debug(
        'trying to end a session part, but there is no session part in progress. This is a no-op.',
      );
      return;
    }

    this._clearSessionPartInactivityTimer();

    const isFinal = reason === 'user_session_ended' || reason === 'inactivity';

    // Capture the end stamp upfront. SpanProcessor.onEnd can run unbounded
    // and must not push it forward.
    const partEndTs = endTs ?? this._perf.getNowMillis();
    const span = this._sessionPartSpan;
    try {
      const endAttrs: Attributes = {
        [KEY_EMB_SESSION_PART_END_REASON]: reason,
        ...this._activeSessionPartCounts,
        ...this._limitManager.getDiagnosticCounts(),
        [KEY_EMB_SDK_STARTUP_DURATION]: this._sdkStartupDuration,
      };
      if (isFinal) {
        endAttrs[KEY_EMB_IS_FINAL_SESSION_PART] = 1;
        if (userSessionEndReason) {
          endAttrs[KEY_EMB_USER_SESSION_TERMINATION_REASON] =
            userSessionEndReason;
        }
      }

      const propertyAttrs: Attributes = {};
      for (const [bareKey, value] of Object.entries(
        this.getSessionPartProperties(),
      )) {
        propertyAttrs[KEY_PREFIX_EMB_PROPERTIES + bareKey] = value;
      }

      try {
        span.setAttributes({
          ...propertyAttrs,
          ...endAttrs,
        });
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
      // Fire listeners after end attributes are on the span so subscribers
      // can read the end reason synchronously, and before span.end() so
      // anything they emit (LoAF flush, route span close) still happens
      // while the part is conceptually active.
      this._fireListeners(this._sessionPartEndedListeners, 'ended');
      try {
        span.end(partEndTs);
      } catch (error) {
        this._diag.warn('Error ending session part span', error);
      }
      this._sessionPartSpan = null;
      this._activeSessionPartId = null;
      this._activeSessionPartCounts = null;
      this._limitManager.reset();
    }

    if (isFinal) {
      this._previousUserSessionId = this._state?.userSessionId ?? null;
      this._state = null;
      this._storage.removeItem(EMBRACE_USER_SESSION_STATE_KEY);
      this._clearMaxDurationTimer();
    } else {
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

    const limitedBreadcrumb = this._limitManager.limitBreadcrumb(name);
    if (limitedBreadcrumb === 'dropped') {
      return;
    }

    this._sessionPartSpan.addEvent(
      'emb-breadcrumb',
      {
        message: limitedBreadcrumb.name,
      },
      this._perf.getNowMillis(),
    );
  }

  public addProperty(
    propertyKey: string,
    value: string,
    options?: PropertyOptions,
  ): void {
    const limitedSessionProperty = this._limitManager.limitSessionProperty(
      propertyKey,
      value,
    );

    if (limitedSessionProperty === 'dropped') {
      return;
    }

    const bareKey = limitedSessionProperty.key;
    const bareValue = limitedSessionProperty.value;

    if (options?.lifespan === 'permanent') {
      const candidate = {
        ...this._permanentProperties,
        [bareKey]: bareValue,
      };
      // Reject the write if storage is unavailable: a property that can't
      // persist would silently diverge from what other tabs (and the next
      // page load) see, which is worse than no property at all.
      if (!storePermanentProperties(this._storage, candidate)) {
        this._diag.warn(
          'Storage unavailable; rejecting permanent property write.',
        );
        return;
      }
      this._permanentProperties = candidate;
      this._removeFromUserSessionProperties(bareKey);
      return;
    }

    // addProperty can be called before the first part starts (the SDK
    // init flow eagerly initializes state, but bare manager usage and
    // tests bypass that path). Ensure a state row exists so the write
    // has somewhere to land.
    const { state } = this._loadOrCreateUserSessionState(
      this._perf.getNowMillis(),
    );
    this._state = {
      ...state,
      userSessionProperties: {
        ...state.userSessionProperties,
        [bareKey]: bareValue,
      },
    };
    if (!this._storeState()) {
      // Reject the property write: roll back to the session-without-the
      // -property so callers don't observe a value that won't persist.
      // The session itself stays in memory; only the property is dropped.
      this._state = state;
      this._diag.warn(
        'Storage unavailable; rejecting user-session property write.',
      );
    }
  }

  public removeProperty(propertyKey: string): void {
    const bareKey = this._limitManager.truncateString(
      'session_property_key',
      propertyKey,
    );

    // Try both stores so a key that was flipped between scopes doesn't
    // linger in the other one.
    this._removeFromPermanentProperties(bareKey);
    this._removeFromUserSessionProperties(bareKey);
  }

  /**
   * Bare-keyed view of properties for the active part. User-session-scoped
   * entries shadow permanent ones, matching the cross-scope flip rule
   * enforced in `addProperty`. Callers apply the wire-format prefix at
   * stamp time.
   */
  public getSessionPartProperties(): Record<string, string> {
    return {
      ...this._permanentProperties,
      ...(this._state?.userSessionProperties ?? {}),
    };
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
    return this._addListener(this._sessionPartStartedListeners, listener);
  }

  public addSessionPartEndedListener(listener: () => void): () => void {
    return this._addListener(this._sessionPartEndedListeners, listener);
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
   * Loads persisted state into _state, rotating if the persisted row is
   * missing or expired. After this call _state is guaranteed non-null
   * and reflects a non-expired user session, so getUserSessionId()
   * returns a real id even before the first part starts.
   *
   * Does not persist a freshly created state; the caller is responsible
   * for writing when persistence matters (eager init writes; part start
   * persists after its own state mutation).
   */
  private _loadOrCreateUserSessionState(now: number): {
    state: UserSessionState;
    created: boolean;
  } {
    let state = readUserSessionState(this._storage, this._diag);
    let created = false;
    if (!state || isUserSessionExpired(state, now)) {
      if (state) {
        this._previousUserSessionId = state.userSessionId;
      }
      const userSessionNumber = getIncrementedCount(
        this._storage,
        EMBRACE_USER_SESSION_NUMBER_KEY,
        this._diag,
      );
      state = createUserSessionState({
        now,
        previousUserSessionId: this._previousUserSessionId,
        maxUserSessionDurationSeconds: this._maxUserSessionDurationSeconds,
        inactivityTimeoutSeconds: this._inactivityTimeoutSeconds,
        userSessionNumber,
      });
      created = true;
    }
    this._state = state;
    this._setupMaxDurationTimer(state, now);
    return { state, created };
  }

  /**
   * Bumps the part counter and arms the max-duration timer. Relies on
   * `_loadOrCreateUserSessionState` to provide a non-null, non-expired state,
   * so `getUserSessionAttributes()` is guaranteed non-null after this.
   */
  private _beginUserSessionForPartStart(): void {
    const now = this._perf.getNowMillis();
    const { state } = this._loadOrCreateUserSessionState(now);

    this._currentSessionPartNumber = getIncrementedCount(
      this._storage,
      EMBRACE_SESSION_PART_NUMBER_KEY,
      this._diag,
    );

    this._state = {
      ...state,
      userSessionPartIndex: state.userSessionPartIndex + 1,
      // A part is active, so any pending inactivity deadline no longer
      // applies; it gets re-armed when the part ends.
      inactivityDeadlineTs: null,
    };
    this._storeState();
  }

  /**
   * Records the inactivity deadline on the user-session row so the next
   * part start can detect lazy expiry. The max-duration timer armed at
   * part start stays valid here, userSessionMaxEndTs doesn't change.
   */
  private _continueUserSessionAfterPartEnd(partEndTs: number): void {
    if (!this._state) {
      this._clearMaxDurationTimer();
      return;
    }

    // Honor explicit clears: if the state row was in storage when the
    // part started but is gone now (user wiped site data, quota
    // eviction, sibling tab cleared), don't quietly resurrect it from
    // our in-memory copy. Drop the in-memory state so the next part
    // start creates a fresh user session, while still carrying the
    // just-ended id forward so the next session's spans/logs can
    // back-link via emb.user_session_previous_id. _hasStoredState
    // gates this: when we never managed to persist in the first place,
    // the in-memory copy stays authoritative.
    if (
      this._hasStoredState &&
      this._storage.getItem(EMBRACE_USER_SESSION_STATE_KEY) === null
    ) {
      this._previousUserSessionId = this._state.userSessionId;
      this._state = null;
      this._clearMaxDurationTimer();
      return;
    }

    this._state = {
      ...this._state,
      inactivityDeadlineTs:
        partEndTs + this._state.inactivityTimeoutSeconds * 1000,
    };
    this._storeState();
  }

  /**
   * Ends the active part as final and starts a fresh part for the next
   * user session. State clearing is handled by endSessionPartInternal's
   * isFinal path. Used by manual endUserSession and max-duration expiry.
   *
   * When no part is active (tab disengaged), this is intentionally a
   * partial no-op: nothing visible is in flight, and the next part start
   * lazily creates a fresh user session via the inactivity/expiry path.
   */
  private _rolloverUserSession(
    userSessionEndReason: UserSessionEndReason,
  ): void {
    try {
      this.endSessionPartInternal('user_session_ended', userSessionEndReason);
    } catch (e) {
      this._diag.error('Error finalizing part during user session end', e);
    }

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
      this._rolloverUserSession('max_duration_reached');
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

  /**
   * Detaches browser-activity listeners and clears the part-inactivity
   * timer. Intended for SDK teardown and tests; in production the manager
   * lives for the page's lifetime.
   */
  public shutdown(): void {
    removeActivityListeners({
      target: this._target,
      visibilityDoc: this._visibilityDoc,
      activityEvents: this._activityEvents,
      onActivity: this._onActivityThrottled,
      onVisibilityChange: this._onVisibilityChange,
      onFocus: this._onFocus,
      onBlur: this._onBlur,
      onPageShow: this._onPageShow,
      onPageHide: this._onPageHide,
    });
    this._clearSessionPartInactivityTimer();
    this._clearMaxDurationTimer();
  }

  private readonly _onActivity = (): void => {
    try {
      if (!isTabEngaged(this._visibilityDoc)) {
        return;
      }
      if (this._activeSessionPartId === null) {
        this.startSessionPartInternal('web_activity');
        return;
      }
      this._startSessionPartInactivityTimer();
    } catch (e) {
      this._diag.warn('Error handling activity event', e);
    }
  };

  // Tab visibility flipped (switch tabs, minimize, OS app switch). Drives
  // the engagement transition off the current visibilityState/hasFocus pair.
  private readonly _onVisibilityChange = (): void => {
    this._handleEngagementTransition('visibilitychange');
  };

  // Window focus arrived (alt-tab back, clicked into the document). hasFocus
  // is now true; engagement transition resolves whether to start a part.
  private readonly _onFocus = (): void => {
    this._handleEngagementTransition('focus');
  };

  // Window focus lost (alt-tab away, clicked into DevTools or another window).
  // hasFocus is now false; engagement transition ends the active part.
  private readonly _onBlur = (): void => {
    this._handleEngagementTransition('blur');
  };

  // Initial page load OR BFCache restore. event.persisted distinguishes the
  // two: false = fresh load (init already started the part, transition is a
  // no-op), true = BFCache restore (the prior pagehide ended the part, this
  // resumes engagement). Both flow through the same transition because the
  // outcome is keyed on whether a part is currently active.
  private readonly _onPageShow = (event: PageTransitionEvent): void => {
    this._handleEngagementTransition(
      event.persisted ? 'pageshow-bfcache' : 'pageshow-initial',
    );
  };

  // Navigation away (hard nav, tab close) OR BFCache freeze. event.persisted
  // distinguishes the two: false = real unload, true = entering BFCache. Both
  // disengage the page; the part ends with web_background either way so OTel
  // can flush its span before the page goes away or gets frozen.
  private readonly _onPageHide = (event: PageTransitionEvent): void => {
    this._handleEngagementTransition(
      event.persisted ? 'pagehide-bfcache' : 'pagehide-unload',
    );
  };

  private _handleEngagementTransition(source: string): void {
    try {
      const engaged = isTabEngaged(this._visibilityDoc);
      const active = this._activeSessionPartId !== null;
      if (!engaged && active) {
        this._diag.debug(`tab disengaged via ${source}; ending current part`);
        this.endSessionPartInternal('web_background');
        return;
      }
      if (engaged && !active) {
        this._diag.debug(`tab engaged via ${source}; starting new part`);
        this.startSessionPartInternal('web_foreground');
        return;
      }
      if (engaged && active) {
        // Defensive: engagement events normally arrive on a transition, so
        // an engaged+active pair shouldn't occur in steady state. Reachable
        // when the browser fires a redundant focus/visibility event, or
        // when a BFCache restore leaves the part flag set. Treat as the
        // user resuming so the disengaged interval doesn't count toward
        // inactivity.
        this._startSessionPartInactivityTimer();
      }
    } catch (e) {
      this._diag.warn('Error handling engagement change', e);
    }
  }

  private readonly _onSessionPartInactivity = (): void => {
    this._sessionPartInactivityTimer = null;
    try {
      if (this._activeSessionPartId === null) {
        return;
      }
      this._diag.debug(
        'inactivity timer fired; ending current part and user session',
      );
      this._endUserSessionForInactivity();
    } catch (e) {
      this._diag.warn('Error handling inactivity timer', e);
    }
  };

  /**
   * Ends the active part (stamped at now, the timer-fire moment) and
   * terminates the enclosing user session in one step. State clearing
   * happens inside endSessionPartInternal's isFinal path. The next
   * user input event lazily starts a fresh user session and part via
   * `_onActivity` -> `startSessionPartInternal('web_activity')`.
   */
  private _endUserSessionForInactivity(): void {
    try {
      this.endSessionPartInternal('inactivity', 'inactivity');
    } catch (e) {
      this._diag.error('Error finalizing part during inactivity end', e);
    }
  }

  private _startSessionPartInactivityTimer(): void {
    this._clearSessionPartInactivityTimer();
    this._sessionPartInactivityTimer = setTimeout(
      this._onSessionPartInactivity,
      this._inactivityTimeoutSeconds * 1000,
    );
  }

  private _clearSessionPartInactivityTimer(): void {
    if (this._sessionPartInactivityTimer !== null) {
      clearTimeout(this._sessionPartInactivityTimer);
      this._sessionPartInactivityTimer = null;
    }
  }

  private _addListener(
    list: Array<() => void>,
    listener: () => void,
  ): () => void {
    list.push(listener);
    return () => {
      const i = list.indexOf(listener);
      if (i !== -1) {
        list.splice(i, 1);
      }
    };
  }

  private _fireListeners(list: Array<() => void>, kind: string): void {
    for (const listener of list) {
      try {
        listener();
      } catch (error) {
        this._diag.warn(
          `Error while executing session part ${kind} listener`,
          error,
        );
      }
    }
  }

  /**
   * Best-effort store of the current in-memory state. _state is the
   * local source of truth; callers mutate it first and ignore the
   * outcome. The return value is only consulted by tests that observe
   * sticky-disabled storage.
   */
  private _storeState(): boolean {
    if (!this._state) {
      return false;
    }
    const stored = this._storage.setItem(
      EMBRACE_USER_SESSION_STATE_KEY,
      JSON.stringify(this._state),
    );
    if (stored) {
      this._hasStoredState = true;
    }
    return stored;
  }

  private _removeFromPermanentProperties(bareKey: string): void {
    if (!(bareKey in this._permanentProperties)) {
      return;
    }
    const pruned = { ...this._permanentProperties };
    delete pruned[bareKey];
    this._permanentProperties = pruned;
    storePermanentProperties(this._storage, pruned);
  }

  private _removeFromUserSessionProperties(bareKey: string): void {
    if (!this._state || !(bareKey in this._state.userSessionProperties)) {
      return;
    }
    const pruned = { ...this._state.userSessionProperties };
    delete pruned[bareKey];
    this._state = {
      ...this._state,
      userSessionProperties: pruned,
    };
    this._storeState();
  }
}
