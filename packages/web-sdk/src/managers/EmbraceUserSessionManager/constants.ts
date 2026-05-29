export const EMBRACE_USER_SESSION_STATE_KEY = 'embrace_user_session_state';
/**
 * Bump when UserSessionState's shape changes incompatibly. Persisted blobs
 * whose schemaVersion doesn't match are discarded on read.
 */
export const USER_SESSION_STATE_SCHEMA_VERSION = 1;
export const EMBRACE_USER_SESSION_NUMBER_KEY = 'embrace_user_session_number';
export const EMBRACE_SESSION_PART_NUMBER_KEY = 'embrace_session_part_number';
export const EMBRACE_PERMANENT_PROPERTIES_KEY = 'embrace_permanent_properties';
export const EMBRACE_LAST_END_USER_SESSION_TS_KEY =
  'embrace_last_end_user_session_ts';

export const SESSION_PART_SPAN_NAME = 'emb-session-part';

export const DEFAULT_USER_SESSION_MAX_DURATION_SECONDS = 12 * 60 * 60;
export const MIN_USER_SESSION_MAX_DURATION_SECONDS = 1 * 60 * 60;
export const MAX_USER_SESSION_MAX_DURATION_SECONDS = 24 * 60 * 60;

export const DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS = 30 * 60;
export const MIN_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS = 30;
export const MAX_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS = 24 * 60 * 60;

export const DEFAULT_USER_SESSION_FOREGROUND_INACTIVITY_TIMEOUT_SECONDS =
  30 * 60;
export const MIN_USER_SESSION_FOREGROUND_INACTIVITY_TIMEOUT_SECONDS = 30;
export const MAX_USER_SESSION_FOREGROUND_INACTIVITY_TIMEOUT_SECONDS =
  24 * 60 * 60;

// Anti-spam guard: minimum interval between successful endUserSession calls.
// Persists across page refreshes so a refresh-and-call loop can't manufacture
// session boundaries faster than this.
export const END_USER_SESSION_COOLDOWN_MS = 5 * 1000;

/**
 * Default upper bound on how often the activity handler runs; prevents
 * mousemove from re-arming the inactivity timer for every sub-second event.
 */
export const DEFAULT_ACTIVITY_THROTTLE_MS = 30 * 1000;

/** Default input events that count as user interaction with a foreground tab. */
export const DEFAULT_ACTIVITY_EVENTS: ReadonlyArray<string> = [
  'keydown',
  'mousedown',
  'mousemove',
  'scroll',
];
