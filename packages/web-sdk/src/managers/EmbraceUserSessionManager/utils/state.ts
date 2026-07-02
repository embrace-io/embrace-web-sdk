import type { DiagLogger } from '@opentelemetry/api';
import { generateUUID } from '../../../utils/generateUUID.ts';
import type { NamespacedStorage } from '../../../utils/NamespacedStorage/NamespacedStorage.ts';
import {
  EMBRACE_PERMANENT_PROPERTIES_KEY,
  EMBRACE_USER_SESSION_STATE_KEY,
  USER_SESSION_STATE_SCHEMA_VERSION,
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

/**
 * Treats the schemaVersion stamp as the contract. Every field is written
 * by createUserSessionState (and userSessionProperties is validated at
 * addProperty time), so a matching version means the blob came from this
 * code path and we trust the rest of its shape.
 */
const isValidStoredUserSessionState = (
  state: unknown,
): state is UserSessionState =>
  state !== null &&
  typeof state === 'object' &&
  (state as { schemaVersion?: unknown }).schemaVersion ===
    USER_SESSION_STATE_SCHEMA_VERSION;

export const readUserSessionState = (
  storage: NamespacedStorage,
  diag: DiagLogger,
): UserSessionState | null => {
  const raw = storage.getItem(EMBRACE_USER_SESSION_STATE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidStoredUserSessionState(parsed)) {
      throw new Error('stored user session state failed structural validation');
    }
    return parsed;
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
