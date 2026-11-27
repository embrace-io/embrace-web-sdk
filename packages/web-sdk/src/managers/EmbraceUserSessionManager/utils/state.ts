import type { UserSessionEndReason } from '../../../api-sessions/index.ts';
import { generateUUID } from '../../../utils/index.ts';
import {
  CLOCK_SKEW_TOLERANCE_MS,
  USER_SESSION_STATE_SCHEMA_VERSION,
} from '../constants.ts';
import type { UserSessionState } from '../types.ts';

/**
 * True when the user session is over: it was marked as ended, the device
 * clock jumped backwards past the recorded start by more than tabs' clocks
 * can differ, the max-duration deadline has passed, or no tab has had activity
 * for the inactivity timeout since the latest activity or the user session's
 * start, whichever is later. Without a stored last activity, the inactivity
 * deadline written at the last part end decides instead; it is null while a
 * part is active.
 */
export const isUserSessionEnded = (
  state: UserSessionState,
  now: number,
  lastActivityTs: number | null,
): boolean =>
  state.ended === true ||
  now < state.userSessionStartTs - CLOCK_SKEW_TOLERANCE_MS ||
  now >= state.userSessionMaxEndTs ||
  (lastActivityTs === null
    ? state.inactivityDeadlineTs !== null && now >= state.inactivityDeadlineTs
    : now >=
      Math.max(lastActivityTs, state.userSessionStartTs) +
        state.userSessionInactivityTimeoutSeconds * 1000);

export interface CreateUserSessionStateArgs {
  now: number;
  userSessionId?: string;
  previousUserSessionId: string | null;
  previousFinalSessionPartId?: string | null;
  userSessionMaxDurationSeconds: number;
  userSessionInactivityTimeoutSeconds: number;
  userSessionForegroundInactivityTimeoutSeconds: number;
  userSessionNumber: number;
}

export const createUserSessionState = ({
  now,
  userSessionId = generateUUID(),
  previousUserSessionId,
  previousFinalSessionPartId = null,
  userSessionMaxDurationSeconds,
  userSessionInactivityTimeoutSeconds,
  userSessionForegroundInactivityTimeoutSeconds,
  userSessionNumber,
}: CreateUserSessionStateArgs): UserSessionState => ({
  schemaVersion: USER_SESSION_STATE_SCHEMA_VERSION,
  userSessionId,
  nextUserSessionId: generateUUID(),
  previousUserSessionId,
  previousFinalSessionPartId,
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

/** The row an ended user session leaves in storage. */
export const createEndedUserSessionState = (
  state: UserSessionState,
  now: number,
  endReason?: UserSessionEndReason,
  finalSessionPartId: string | null = null,
): UserSessionState => ({
  ...state,
  ended: true,
  endReason,
  finalSessionPartId,
  inactivityDeadlineTs: now,
  userSessionProperties: {},
});
