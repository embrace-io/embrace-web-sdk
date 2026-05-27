import type { ExtendedSpan } from '../../index.ts';

export interface UserSessionManager {
  /** @deprecated Will be removed in a future version, use getUserSessionId(); returns null when no user session is active. */
  getSessionId: () => string | null;

  /** @deprecated Will be removed in a future version, always returns null. Use getPreviousUserSessionId(). */
  getPreviousSessionId: () => null;

  /**
   * @deprecated Will be removed in a future version, use
   * getUserSessionStartTime(); returns null when no user session is active,
   * otherwise milliseconds since the Unix epoch.
   */
  getSessionStartTime: () => number | null;

  /** @deprecated Will be removed in a future version, use getSessionPartSpan(); returns null when no part is active. */
  getSessionSpan: () => ExtendedSpan | null;

  /**
   * @deprecated Will be removed in a future version. No-op: starting a
   * session part is an internal consequence of foreground engagement
   * (visibility, focus, input) and is not exposed to callers.
   */
  startSessionSpan: (options?: StartSessionOptions) => void;

  /** @deprecated Will be removed in a future version, use endUserSession(). */
  endSessionSpan: () => void;

  /**
   * Adds a breadcrumb event to the active session part span. If no part is
   * active the breadcrumb is dropped.
   */
  addBreadcrumb: (name: string) => void;

  /**
   * Stores a key/value property that travels with every session part within
   * the current user session. Properties added without `lifespan: 'permanent'`
   * survive across foreground/background transitions but are cleared when the
   * user session ends. They are persisted alongside the user-session state in
   * localStorage, so other tabs sharing the same user session pick them up
   * on their next part start. With `lifespan: 'permanent'` the property is
   * stored as its own localStorage entry and reapplied across user sessions
   * until removed via `removeProperty(key)`.
   *
   * When storage is unavailable, writes are rejected (both for `lifespan:
   * 'permanent'` and the default user-session scope), the in-memory state
   * is not updated, and the property will not appear on any session part
   * span. A warning is logged.
   *
   * Safe to call before any part is active. Properties are persisted
   * immediately and stamped on the session part span at end time.
   */
  addProperty: (key: string, value: string, options?: PropertyOptions) => void;

  /**
   * Removes a property regardless of scope: clears it from the in-memory
   * maps (both user-session and permanent) and from localStorage.
   */
  removeProperty: (key: string) => void;

  /** @deprecated Will be removed in a future version, always returns null. */
  currentSessionAsReadableSpan: (reason: ReasonSessionEnded) => null;

  /** @deprecated Will be removed in a future version, the listener is never invoked and the returned unsubscribe is a no-op. */
  addSessionStartedListener: (listener: () => void) => () => void;

  /** @deprecated Will be removed in a future version, the listener is never invoked and the returned unsubscribe is a no-op. */
  addSessionEndedListener: (listener: () => void) => () => void;

  /**
   * Returns the active user session UUID, or `null` when no user session active
   */
  getUserSessionId: () => string | null;
  getPreviousUserSessionId: () => string | null;
  getUserSessionStartTime: () => number | null;

  /**
   * Ends the current user session. The next foreground session part will
   * begin a new user session; there is no companion public start API,
   * starting is an internal consequence of the next foreground part.
   *
   * Subject to a 5-second cooldown.
   *
   * If no part is active when called, the user session is still ended and
   * the next foreground part begins a new one, but no part span can carry
   * `emb.user_session_termination_reason='manual'` (the attribute is only
   * stamped on a final part span).
   */
  endUserSession: () => void;
}

/** @deprecated Will be removed in a future version */
export type ReasonSessionEnded =
  | 'unknown'
  | 'inactivity' // inactivity timer
  | 'timer' // max_time_reached limit
  | 'manual' // using the public api
  | 'max_size_reached'
  | 'state_changed'; // visibility change

export type PropertyOptions = {
  lifespan?: 'permanent';
};

/** @deprecated Will be removed in a future version */
export type StartSessionOptions = {
  reason?: string;
};

// Reasons that describe SDK-agnostic, cross-platform concepts (`init`,
// `manual`, `inactivity`, `max_duration_reached`, `user_session_rollover`,
// `user_session_ended`) are emitted unprefixed so the backend can correlate
// them across platforms. Reasons that describe behaviour specific to the web
// environment (`web_foreground`, `web_background`, `web_activity`,
// `web_inactivity`) are stamped with a `web_` prefix.

export type SessionPartStartReason =
  | 'init' // first part on SDK init (page load); covers the hard-nav load side
  | 'web_foreground' // tab became engaged via visibilitychange (visible) or focus while no part was active
  | 'web_activity' // user input resumed after an inactivity-killed part
  | 'user_session_rollover'; // synchronous user-session rollover forced a new part (endUserSession API / max-duration timer)

export type SessionPartEndReason =
  | 'web_background' // tab disengaged via visibilitychange (hidden) or blur. Also covers hard-nav unload and BFCache freeze (pagehide is not listened to)
  | 'web_inactivity' // no keyboard/mouse/scroll input during the active part for the configured inactivity window; also ends the enclosing user session, with the part span end timestamp anchored to the last activity
  | 'user_session_ended'; // closed because the enclosing user session ended (manual endUserSession, max-duration); stamped on the span by the manager

export type UserSessionEndReason =
  | 'manual'
  | 'max_duration_reached'
  | 'inactivity';
