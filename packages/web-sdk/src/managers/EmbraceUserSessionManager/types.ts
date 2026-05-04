import type { DiagLogger, HrTime, TracerProvider } from '@opentelemetry/api';
import type {
  SessionPartEndReason,
  SessionPartStartReason,
  TerminationInfo,
  UserSessionManager,
} from '../../api-sessions/manager/types.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import type { ExtendedSpan } from '../../index.ts';
import type { PerformanceManager, SafeStorageLike } from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';

export interface UserSessionState {
  readonly userSessionId: string;
  // Null on the first user session since SDK install or after permanent
  // storage clear.
  readonly previousUserSessionId: string | null;
  readonly userSessionStartTs: number;
  readonly userSessionMaxEndTs: number;
  readonly userSessionNumber: number;
  // The only mutable field on the row: bumped on every part start. All
  // other fields are frozen for the user session's lifetime per spec 3
  // edge case 2.
  userSessionPartNumber: number;
  // Configured values captured at session creation, persisted so the
  // lifetime-lock survives page reloads where the manager could otherwise
  // reconstruct with different config.
  readonly maxDurationMs: number;
  readonly inactivityTimeoutMs: number;
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
 * SDK-internal handle on the user-session manager. Extends the public
 * `UserSessionManager` with the part-side surface (span lifecycle, listeners,
 * counters) and the user-session attribute snapshot used by span/log
 * processors. Instrumentations, processors, and the SDK init flow take this
 * type; customer code only sees `UserSessionManager`.
 */
export interface UserSessionManagerInternal extends UserSessionManager {
  getUserSessionAttributes: () => UserSessionAttributes | null;
  /**
   * Override for the OTel-standard `session.id` attribute, set via
   * `setSessionId`, or `null` when unset.
   */
  getUserSessionIdOverride: () => string | null;

  getSessionPartId: () => string | null;
  getSessionPartStartTime: () => HrTime | null;
  getSessionPartSpan: () => ExtendedSpan | null;

  startSessionPart: (reason?: SessionPartStartReason) => void;
  endSessionPart: () => void;
  /**
   * Takes a structured reason and optional termination info so the part
   * span carries `is_final` and `termination_reason` correctly. The public
   * `endSessionPart()` forwards with reason `'manual'` and no termination
   * info.
   */
  endSessionPartInternal: (
    reason: SessionPartEndReason,
    terminationInfo?: TerminationInfo,
  ) => void;

  incrSessionPartCountForKey: (key: string) => void;
  /** Same as `incrSessionPartCountForKey` but for the next part. */
  incrNextSessionPartCountForKey: (key: string) => void;

  /**
   * Listeners must not call back into part lifecycle methods
   * (`endSessionPart`, `startSessionPart`) synchronously.
   */
  addSessionPartStartedListener: (listener: () => void) => () => void;
  /** See `addSessionPartStartedListener` re re-entrancy. */
  addSessionPartEndedListener: (listener: () => void) => () => void;

  /**
   * Wires the tracer provider after construction; required before the
   * first part start.
   */
  setTracerProvider: (tracerProvider: TracerProvider) => void;
}

export interface EmbraceUserSessionManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  storage?: SafeStorageLike;
  config?: UserSessionConfig;
  /**
   * EventTarget on which to listen for cross-tab `storage` events. Defaults
   * to `window`. Override for tests.
   */
  storageEventTarget?: EventTarget;
  /**
   * Document-shaped object used to gate part start/end on visibility +
   * focus. Defaults to `window.document`. Override for tests.
   */
  visibilityDoc?: VisibilityStateDocument;
  /**
   * Limit manager used for property/breadcrumb truncation and
   * dropped-record counting. Required to drive session parts.
   */
  limitManager?: LimitManagerInternal;
}

export type SessionPartStartedListener = () => void;
export type SessionPartEndedListener = () => void;
