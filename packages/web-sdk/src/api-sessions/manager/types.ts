import type { HrTime } from '@opentelemetry/api';
import type { ExtendedSpan } from '../../index.ts';

export interface UserSessionManager {
  /**
   * Returns the active user session UUID, or `null` when no user session is
   * active. Span/log processors that need an always-string value (because
   * span and log attributes cannot carry `null`) coerce with `?? ''` at the
   * call site.
   */
  getUserSessionId: () => string | null;
  getPreviousUserSessionId: () => string | null;
  getUserSessionStartTime: () => number | null;

  /**
   * Ends the current user session. The next foreground session part will
   * begin a new user session. There is no public start API per spec 1.4;
   * starting is an internal consequence of the next foreground part.
   *
   * Subject to a 5-second cooldown.
   *
   * If no part is active when called, no part span can carry
   * `emb.user_session_termination_reason='manual'`: the user session is
   * still ended and the next foreground part begins a new one, but the
   * terminating part span will carry whatever `emb.session_part_end_reason`
   * it was ended with (e.g., `visibility_change`).
   */
  endUserSession: () => void;

  /**
   * Overrides the value emitted in the `session.id` attribute on spans and
   * logs. Does not affect `emb.user_session_id`, which remains the SDK-assigned
   * user session UUID. Pass `null` to remove the override and fall back to the
   * default (`session.id` === `emb.user_session_id`). The override persists
   * across user session boundaries until cleared.
   *
   * Must be called after `initSDK` returns; calls made on the proxy before
   * the SDK initializes are dropped.
   *
   * This is a convenience wrapper: `session.id` is the OpenTelemetry standard
   * session attribute, so callers can equivalently set it per-span or per-log
   * with `span.setAttribute('session.id', id)` /
   * `logRecord.setAttributes({ 'session.id': id })`, or register their own
   * span/log processor to set it globally. Use this method when you want the
   * SDK to apply the override to every span and log automatically. Per-span /
   * per-log values take precedence over this SDK-level override.
   */
  setSessionId: (id: string | null) => void;

  addUserSessionStartedListener: (listener: () => void) => () => void;
  /**
   * Listeners must not call back into `endUserSession` synchronously; the
   * inner call is rejected with a diag warning.
   */
  addUserSessionEndedListener: (listener: () => void) => () => void;

  /**
   * Adds a breadcrumb event to the active session part span. If no part is
   * active the breadcrumb is dropped.
   */
  addBreadcrumb: (name: string) => void;

  /**
   * Stores a key/value property that travels with every session part within
   * the current user session. Properties added without `lifespan: 'permanent'`
   * survive across foreground/background transitions but are cleared when the
   * user session ends (manual `endUserSession()`, max-duration rollover, or a
   * cross-tab end). With `lifespan: 'permanent'` the property is also written
   * to localStorage and reapplied across user sessions until removed via
   * `removeProperty(key)`.
   *
   * Safe to call before any part is active: the value is queued in memory and
   * applied on the next part start.
   */
  addProperty: (key: string, value: string, options?: PropertyOptions) => void;

  /**
   * Removes a property regardless of scope: clears it from the in-memory
   * user-session map and from localStorage if it was permanent. If a part is
   * currently active, also removes the attribute from the active part span.
   */
  removeProperty: (key: string) => void;

  /** @deprecated Use getUserSessionId() */
  getSessionId: () => string | null;
  /** @deprecated Use getPreviousUserSessionId() */
  getPreviousSessionId: () => string | null;
  /**
   * @deprecated Use getUserSessionStartTime(). Returns OTel `HrTime`
   * (`[seconds, nanoseconds]`); prefer the millisecond replacement.
   */
  getSessionStartTime: () => HrTime | null;
  /** @deprecated Use endUserSession() */
  endSessionSpan: () => void;
  /**
   * @deprecated The session part span is no longer part of the public API
   * and this method always returns `null`. Use getUserSessionId() for user
   * session identity.
   */
  getSessionSpan: () => ExtendedSpan | null;
  /**
   * @deprecated **Behavior changed**: forwards to
   * `addUserSessionStartedListener`. Fires on user-session boundaries
   * (max-duration rollover, manual `endUserSession()`, lazy inactivity
   * detection on the next part start, clock-jump-backwards detection, or
   * cross-tab termination cascade), NOT on every foreground-visibility
   * transition as in prior versions. There is no replacement for the
   * per-foreground-interval semantics.
   */
  addSessionStartedListener: (listener: () => void) => () => void;
  /**
   * @deprecated **Behavior changed**: forwards to
   * `addUserSessionEndedListener`. Fires on user-session boundaries
   * (max-duration rollover, manual `endUserSession()`, lazy inactivity
   * detection on the next part start, clock-jump-backwards detection, or
   * cross-tab termination cascade), NOT on every foreground-visibility
   * transition as in prior versions. There is no replacement for the
   * per-foreground-interval semantics.
   */
  addSessionEndedListener: (listener: () => void) => () => void;
}

/** @deprecated Use UserSessionManager */
export type SpanSessionManager = UserSessionManager;

export type SessionPartEndReason =
  | 'manual' // public endSessionPart()
  | 'visibility_change' // document transitioned to hidden
  | 'inactivity' // no keyboard/mouse/scroll input during the active part for the configured part-inactivity window
  | 'user_session_ended'; // closed by the user-session manager during a rollover

export type SessionPartStartReason =
  | 'init' // first part on SDK init (page load)
  | 'visibility_change' // tab transitioned back to visible and no part was active
  | 'activity' // user input resumed after an inactivity-killed part
  | 'user_session_rollover'; // synchronous user-session rollover forced a new part (endUserSession API / max-duration timer)

export type PropertyOptions = {
  lifespan?: 'permanent';
};

export type UserSessionTerminationReason =
  | 'manual'
  | 'max_duration_reached'
  // Reserved per spec §5. The web SDK does not emit this value: inactivity is
  // detected lazily on the next part start, by which time the prior part's
  // span has already been finalized and exported, so there is no span to
  // stamp the termination reason on. Kept in the union to match the spec's
  // enumerated values for consumers narrowing on the type.
  | 'inactivity'
  // Web SDK extension (not in the cross-platform spec). Emitted on peer tabs
  // when their cross-tab session change was triggered by another tab clearing
  // the state key after detecting corrupt JSON. Without this distinct value,
  // the cascade exports as `reason: null` and is indistinguishable from a
  // peer-initiated end with unknown cause.
  | 'storage_corrupted';

// `reason: null` represents a final termination with an unknown cause: used
// when a peer tab's storage event signals the session is over but the
// reason isn't available locally. `KEY_EMB_USER_SESSION_TERMINATION_REASON`
// stays off the part span when reason is null (the attribute is optional
// per spec).
export type TerminationInfo = {
  readonly isFinal: true;
  readonly reason: UserSessionTerminationReason | null;
};
