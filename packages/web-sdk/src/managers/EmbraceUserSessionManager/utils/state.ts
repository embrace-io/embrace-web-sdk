import { generateUUID } from '../../../utils/index.ts';
import { USER_SESSION_STATE_SCHEMA_VERSION } from '../constants.ts';
import type { UserSessionState } from '../types.ts';

/**
 * True when the stored state is no longer trustworthy: the device clock
 * jumped backwards past the recorded start, the max-duration deadline has
 * passed, or an inactivity deadline (set when the last part ended) has
 * passed. The inactivity deadline only applies between parts; it is null
 * while a part is active.
 */
export const isUserSessionExpired = (
  state: UserSessionState,
  now: number,
): boolean =>
  now < state.userSessionStartTs ||
  now >= state.userSessionMaxEndTs ||
  (state.inactivityDeadlineTs !== null && now >= state.inactivityDeadlineTs);

export interface CreateUserSessionStateArgs {
  now: number;
  previousUserSessionId: string | null;
  userSessionMaxDurationSeconds: number;
  userSessionInactivityTimeoutSeconds: number;
  userSessionForegroundInactivityTimeoutSeconds: number;
  userSessionNumber: number;
}

export const createUserSessionState = ({
  now,
  previousUserSessionId,
  userSessionMaxDurationSeconds,
  userSessionInactivityTimeoutSeconds,
  userSessionForegroundInactivityTimeoutSeconds,
  userSessionNumber,
}: CreateUserSessionStateArgs): UserSessionState => ({
  schemaVersion: USER_SESSION_STATE_SCHEMA_VERSION,
  userSessionId: generateUUID(),
  previousUserSessionId,
  userSessionStartTs: now,
  userSessionMaxEndTs: now + userSessionMaxDurationSeconds * 1000,
  userSessionNumber,
  userSessionPartIndex: 0,
  userSessionMaxDurationSeconds,
  userSessionInactivityTimeoutSeconds,
  userSessionForegroundInactivityTimeoutSeconds,
  inactivityDeadlineTs: null,
  userSessionProperties: {},
});
