import type { HrTime } from '@opentelemetry/api';
import type { ExtendedSpan } from '../../index.ts';

export interface SessionPartManager {
  getSessionPartId: () => string | null;

  getPreviousSessionPartId: () => string | null;

  getSessionPartStartTime: () => HrTime | null;

  /**
   * @internal SDK use only. Exposed so instrumentations can write custom
   * attributes directly to the part span; not part of the public API.
   */
  getSessionPartSpan: () => ExtendedSpan | null;

  startSessionPart: (reason?: SessionPartStartReason) => void;

  endSessionPart: () => void;

  addBreadcrumb: (name: string) => void;

  addProperty: (key: string, value: string, options?: PropertyOptions) => void;

  removeProperty: (key: string) => void;

  /**
   * @internal SDK use only. The public `endSessionPart()` always uses reason
   * `'manual'`; this overload lets the SDK pass a structured reason.
   */
  endSessionPartInternal: (reason: SessionPartEndReason) => void;

  /**
   * @internal SDK use only. Used by the batched span processor to track
   * per-session counters (e.g. spans dropped by limit).
   */
  incrSessionPartCountForKey: (key: string) => void;

  /**
   * @internal SDK use only. Same as `incrSessionPartCountForKey` but targeting the
   * next session part instead of the current one.
   */
  incrNextSessionPartCountForKey: (key: string) => void;

  /**
   * Listeners must not call back into session part lifecycle methods
   * (`endSessionPart`, `startSessionPart`) synchronously; behavior is
   * undefined and re-entry is not guarded against.
   */
  addSessionPartStartedListener: (listener: () => void) => () => void;

  /**
   * Listeners must not call back into session part lifecycle methods
   * (`endSessionPart`, `startSessionPart`) synchronously; behavior is
   * undefined and re-entry is not guarded against.
   */
  addSessionPartEndedListener: (listener: () => void) => () => void;
}

export interface UserSessionManager {
  /**
   * Returns the active user session UUID, or `null` when no user session is
   * active. The public API uses `null` for "absent" so callers can use the
   * normal null-check idiom. The processor-side counterpart `SessionIds`
   * (in `EmbraceUserSessionManager/types.ts`) renders the same data as
   * always-string with empty-string for "absent" because span and log
   * attributes cannot carry `null`.
   */
  getUserSessionId: () => string | null;
  getPreviousUserSessionId: () => string | null;
  getUserSessionStartTime: () => number | null;

  // Session part identity (read-only, for correlation/debugging)
  getSessionPartId: () => string | null;
  getPreviousSessionPartId: () => string | null;

  /**
   * Ends the current user session. The next foreground session part will
   * begin a new user session.
   *
   * Spec 1.4: starting a user session is an internal consequence of the next
   * foreground part; there is no public start API.
   *
   * Subject to a 5-second cooldown: repeated calls within the cooldown are
   * ignored.
   *
   * **Edge case to be aware of**: when no session part is active at call time
   * (e.g., the tab has just lost focus, or `endSessionPart` was called
   * manually), the `emb.user_session_termination_reason='manual'` attribute
   * cannot be attached to any part span; the previously-active part has
   * already been finalized and exported. The user session is still ended and
   * a new one starts on the next foreground part, but the terminating part
   * span will carry whatever `emb.session_part_end_reason` it was ended with
   * (e.g., `visibility_change`) rather than `user_session_ended`. Per spec,
   * `emb.user_session_termination_reason` is optional; this is acceptable
   * but worth knowing when correlating manual end calls to telemetry.
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

  // User session listeners
  /**
   * Listeners must not call back into `endUserSession` synchronously;
   * behavior is undefined and re-entry is not guarded against.
   */
  addUserSessionStartedListener: (listener: () => void) => () => void;
  /**
   * Listeners must not call back into `endUserSession` synchronously;
   * behavior is undefined and re-entry is not guarded against.
   */
  addUserSessionEndedListener: (listener: () => void) => () => void;

  // User session properties
  addBreadcrumb: (name: string) => void;
  addUserSessionProperty: (
    key: string,
    value: string,
    options?: PropertyOptions,
  ) => void;
  addPermanentUserSessionProperty: (key: string, value: string) => void;
  removeUserSessionProperty: (key: string) => void;

  /** @deprecated Use addUserSessionProperty() */
  addProperty: (key: string, value: string, options?: PropertyOptions) => void;
  /** @deprecated Use removeUserSessionProperty() */
  removeProperty: (key: string) => void;
  /** @deprecated Use getUserSessionId() */
  getSessionId: () => string | null;
  /** @deprecated Use getPreviousUserSessionId() */
  getPreviousSessionId: () => string | null;
  /**
   * @deprecated Use getUserSessionStartTime(). Returns the user-session start
   * time converted from milliseconds since the Unix epoch into OTel `HrTime`
   * (`[seconds, nanoseconds]`); prefer the millisecond-valued replacement.
   */
  getSessionStartTime: () => HrTime | null;
  /** @deprecated Use endUserSession() */
  endSessionSpan: () => void;
  /**
   * @deprecated The session part span is no longer part of the public API.
   * Use getSessionPartId() for the identifier, or getUserSessionId() for user session identity.
   */
  getSessionSpan: () => ExtendedSpan | null;
  /**
   * @deprecated Forwards to `addUserSessionStartedListener`. Fires on user
   * session boundaries (the configured max-duration window, default 12 h, or
   * until `endUserSession()` is called). For per-foreground-interval
   * semantics use `getSessionPartManager().addSessionPartStartedListener()`.
   */
  addSessionStartedListener: (listener: () => void) => () => void;
  /**
   * @deprecated Forwards to `addUserSessionEndedListener`. Fires on user
   * session boundaries (the configured max-duration window, default 12 h, or
   * until `endUserSession()` is called). For per-foreground-interval
   * semantics use `getSessionPartManager().addSessionPartEndedListener()`.
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
