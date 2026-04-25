import type { DiagLogger } from '@opentelemetry/api';
import type { PerformanceManager } from '../../utils/index.ts';

export interface UserSessionState {
  userSessionId: string;
  userSessionStartTs: number;
  sessionMaxEndTs: number;
  // Null while a foreground part is active; set to `part_end_ts +
  // inactivityTimeoutMs` by onSessionPartEnd (spec 1.1). Expiry is detected
  // lazily at the next onSessionPartStart call.
  inactivityDeadlineTs: number | null;
  userSessionNumber: number;
  userSessionPartNumber: number;
  // Configured values captured at session creation. Persisted so the
  // lifetime-lock (spec 3, edge case 2) survives page reloads where the
  // manager could otherwise reconstruct with different config.
  maxDurationMs: number;
  inactivityTimeoutMs: number;
}

export interface UserSessionConfig {
  maxDurationSeconds?: number;
  inactivityTimeoutSeconds?: number;
}

/**
 * Attributes emitted by the user-session layer. Units are normative so that
 * the backend and any downstream consumer can interpret them without guessing.
 *
 * - `emb.user_session_start_ts` is milliseconds since the Unix epoch
 *   (`performance.timeOrigin + performance.now()`), matching the SDK's
 *   monotonic clock (see `OTelPerformanceManager`).
 * - `emb.user_session_max_duration_seconds` and
 *   `emb.user_session_inactivity_timeout_seconds` are whole seconds.
 * - `emb.user_session_number` counts monotonically from 1 across the SDK's
 *   install lifetime.
 * - `emb.user_session_part_number` is 1-indexed within the user session.
 */
export interface UserSessionAttributes {
  readonly 'session.id': string;
  readonly 'emb.user_session_id': string;
  readonly 'emb.user_session_number': number;
  readonly 'emb.user_session_part_number': number;
  /** Milliseconds since the Unix epoch. */
  readonly 'emb.user_session_start_ts': number;
  /** Whole seconds. */
  readonly 'emb.user_session_max_duration_seconds': number;
  /** Whole seconds. */
  readonly 'emb.user_session_inactivity_timeout_seconds': number;
}

/**
 * Session identifiers used by span/log processors. Values default to an empty
 * string when the corresponding session is absent.
 *
 * `sessionIdOverride` is the value last set via `setSessionId()` (or null if
 * unset). Processors must honor it for the OTel-standard `session.id` even
 * when no part is active, since it is customer-owned attribution rather than
 * SDK-generated session attribution.
 */
export interface SessionIds {
  readonly sessionId: string;
  readonly sessionPreviousId: string;
  readonly userSessionId: string;
  readonly userSessionPreviousId: string;
  readonly sessionIdOverride: string | null;
}

export interface UserSessionLifecycleManager {
  getUserSessionId: () => string | null;
  getPreviousUserSessionId: () => string | null;
  getUserSessionStartTime: () => number | null;
  getUserSessionAttributes: () => UserSessionAttributes | null;
  /**
   * Snapshot of the 4 session IDs (empty strings where unset). Exposed so
   * span/log processors can stamp them on every record, including those
   * emitted outside an active session part.
   */
  getSessionIds: () => SessionIds;
  onSessionPartStart: () => UserSessionAttributes;
  /**
   * `partEndTs` is the millisecond-since-epoch timestamp the part finalized at.
   * When provided, the inactivity deadline is computed from that exact moment
   * (`partEndTs + inactivityTimeoutMs`); when omitted, the manager falls back
   * to its own performance clock at the moment the callback runs.
   */
  onSessionPartEnd: (partEndTs?: number) => void;
  setSessionPartCallbacks: (callbacks: {
    endSessionPart: () => void;
    startSessionPart: () => void;
  }) => void;
  getTerminationInfo: () => TerminationInfo;
  endUserSession: () => void;
  setSessionId: (id: string | null) => void;
  addUserSessionStartedListener: (listener: () => void) => () => void;
  addUserSessionEndedListener: (listener: () => void) => () => void;
}

export type UserSessionTerminationReason =
  | 'manual'
  | 'max_duration_reached'
  // Reserved per spec §5. The web SDK does not emit this value: inactivity is
  // detected lazily on the next part start, by which time the prior part's
  // span has already been finalized and exported, so there is no span to
  // stamp the termination reason on. Kept in the union to match the spec's
  // enumerated values for consumers narrowing on the type.
  | 'inactivity';

export type TerminationInfo =
  | { readonly isFinal: false; readonly reason: null }
  | { readonly isFinal: true; readonly reason: UserSessionTerminationReason };

export interface EmbraceUserSessionManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  storage?: Storage;
  config?: UserSessionConfig;
  /**
   * EventTarget on which to listen for cross-tab `storage` events. Defaults
   * to `window`. Override for tests.
   */
  storageEventTarget?: EventTarget;
}
