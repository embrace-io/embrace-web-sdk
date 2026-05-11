import type { DiagLogger } from '@opentelemetry/api';
import type { NamespacedStorage } from '../../../utils/index.ts';
import { generateUUID } from '../../../utils/index.ts';
import {
  EMBRACE_PERMANENT_PROPERTIES_KEY,
  EMBRACE_USER_SESSION_STATE_KEY,
} from '../constants.ts';
import type { UserSessionState } from '../types.ts';

/**
 * True when the stored state is no longer trustworthy: the device clock
 * jumped backwards past the recorded start, the max-duration deadline has
 * passed, or an inactivity deadline (set when the last part ended) has
 * passed. Inactivity only applies between parts; the deadline is null
 * while a part is active.
 */
export const isUserSessionExpired = (
  state: UserSessionState,
  now: number,
): boolean => {
  if (now < state.userSessionStartTs) {
    return true;
  }
  if (now >= state.userSessionMaxEndTs) {
    return true;
  }
  return (
    state.inactivityDeadlineTs !== null && now >= state.inactivityDeadlineTs
  );
};

export interface CreateUserSessionStateArgs {
  now: number;
  previousUserSessionId: string | null;
  maxUserSessionDurationSeconds: number;
  inactivityTimeoutSeconds: number;
  userSessionNumber: number;
}

export const createUserSessionState = ({
  now,
  previousUserSessionId,
  maxUserSessionDurationSeconds,
  inactivityTimeoutSeconds,
  userSessionNumber,
}: CreateUserSessionStateArgs): UserSessionState => ({
  userSessionId: generateUUID(),
  previousUserSessionId,
  userSessionStartTs: now,
  userSessionMaxEndTs: now + maxUserSessionDurationSeconds * 1000,
  userSessionNumber,
  userSessionPartIndex: 0,
  // Snapshot config so a mid-session config change doesn't shift this
  // user session's expiry bounds.
  maxUserSessionDurationSeconds,
  inactivityTimeoutSeconds,
  inactivityDeadlineTs: null,
  userSessionProperties: {},
});

const isValidStoredUserSessionState = (state: UserSessionState): boolean => {
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
    !Number.isFinite(state.userSessionPartIndex) ||
    state.userSessionPartIndex < 0 ||
    !Number.isFinite(state.maxUserSessionDurationSeconds) ||
    !Number.isFinite(state.inactivityTimeoutSeconds)
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
};

export const readUserSessionState = (
  storage: NamespacedStorage,
  diag: DiagLogger,
): UserSessionState | null => {
  const raw = storage.getItem(EMBRACE_USER_SESSION_STATE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const state = JSON.parse(raw) as UserSessionState;
    if (!isValidStoredUserSessionState(state)) {
      throw new Error('stored user session state failed structural validation');
    }
    return state;
  } catch (e) {
    diag.error('User session state in storage is corrupt; discarding it', e);
    storage.removeItem(EMBRACE_USER_SESSION_STATE_KEY);
    return null;
  }
};

export const readPermanentProperties = (
  storage: NamespacedStorage,
  diag: DiagLogger,
): Record<string, string> => {
  const raw = storage.getItem(EMBRACE_PERMANENT_PROPERTIES_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error('permanent properties blob is not a plain object');
    }
    const validated: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        validated[key] = value;
      }
    }
    return validated;
  } catch (e) {
    diag.error('Permanent properties in storage are corrupt; discarding', e);
    storage.removeItem(EMBRACE_PERMANENT_PROPERTIES_KEY);
    return {};
  }
};

/**
 * Empty blobs are removed rather than written so storage stays tidy when
 * the last property is cleared. Returns false on a failed write; callers
 * gate cross-scope flips on this so a failed permanent write doesn't
 * strip the previously-visible user-session-scoped value.
 */
export const storePermanentProperties = (
  storage: NamespacedStorage,
  properties: Record<string, string>,
): boolean => {
  if (Object.keys(properties).length === 0) {
    return storage.removeItem(EMBRACE_PERMANENT_PROPERTIES_KEY);
  }
  return storage.setItem(
    EMBRACE_PERMANENT_PROPERTIES_KEY,
    JSON.stringify(properties),
  );
};
