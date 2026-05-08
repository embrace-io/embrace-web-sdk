export const EMBRACE_USER_SESSION_STATE_KEY = 'embrace_user_session_state';
export const EMBRACE_USER_SESSION_NUMBER_KEY = 'embrace_user_session_number';

export const DEFAULT_USER_SESSION_MAX_DURATION_MS = 12 * 60 * 60 * 1000;
export const MIN_USER_SESSION_MAX_DURATION_MS = 1 * 60 * 60 * 1000;
export const MAX_USER_SESSION_MAX_DURATION_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_USER_SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
export const MIN_USER_SESSION_INACTIVITY_TIMEOUT_MS = 30 * 1000;
export const MAX_USER_SESSION_INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

// 5 seconds cooldown between endUserSession calls (per spec)
export const END_USER_SESSION_COOLDOWN_MS = 5 * 1000;
