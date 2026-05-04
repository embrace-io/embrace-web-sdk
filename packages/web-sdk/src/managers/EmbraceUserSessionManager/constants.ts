export const EMBRACE_USER_SESSION_STATE_KEY = 'embrace_user_session_state';
export const EMBRACE_USER_SESSION_NUMBER_KEY = 'embrace_user_session_number';
// Set by a tab that detects corrupt JSON in the state key and discards it.
// Peer tabs read and clear this on their next `_onStorage` so the resulting
// cross-tab session change is exported with a diagnosable termination reason
// instead of `null`.
export const EMBRACE_USER_SESSION_CORRUPT_MARKER_KEY =
  'embrace_user_session_corrupt_marker';
// Holds the absolute timestamp at which the active user session expires from
// inactivity (`part_end_ts + inactivityTimeoutMs`). Written on every part-end
// that does NOT terminate the user session; cleared whenever a part starts
// (the session is engaged again) or the user session ends. Stored in its own
// key so part-end writes never clobber a peer tab's pn bump in the main
// state key.
export const EMBRACE_USER_SESSION_INACTIVITY_DEADLINE_KEY =
  'embrace_user_session_inactivity_deadline';

// 12 hours in milliseconds (default max user session duration)
export const DEFAULT_USER_SESSION_MAX_DURATION_MS = 12 * 60 * 60 * 1000;
// 1 hour in milliseconds (minimum allowed max user session duration per spec)
export const MIN_USER_SESSION_MAX_DURATION_MS = 1 * 60 * 60 * 1000;
// 24 hours in milliseconds (maximum allowed max user session duration per spec)
export const MAX_USER_SESSION_MAX_DURATION_MS = 24 * 60 * 60 * 1000;

// 30 minutes in milliseconds (default user session inactivity timeout)
export const DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
// 30 seconds in milliseconds (minimum allowed user session inactivity timeout per spec)
export const MIN_USER_SESSION_INACTIVITY_TIMEOUT_MS = 30 * 1000;
// 24 hours in milliseconds (maximum allowed user session inactivity timeout per spec)
export const MAX_USER_SESSION_INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

// 5 seconds cooldown between endUserSession calls (per spec)
export const END_USER_SESSION_COOLDOWN_MS = 5 * 1000;
