import type { DiagLogger, TracerProvider } from '@opentelemetry/api';
import type {
  SessionPartEndReason,
  SessionPartStartReason,
  SpanSessionManager,
  UserSessionEndReason,
} from '../../api-sessions/manager/types.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import type { ExtendedSpan } from '../../index.ts';
import type { EmbraceStorage, PerformanceManager } from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';

export interface UserSessionState {
  readonly userSessionId: string;
  // Null on the first user session since SDK install or after permanent
  // storage clear.
  readonly previousUserSessionId: string | null;
  readonly userSessionStartTs: number;
  readonly userSessionMaxEndTs: number;
  readonly userSessionNumber: number;
  // Bumped on every part start.
  userSessionPartNumber: number;
  // Configured values captured at session creation, persisted so the
  // lifetime-lock survives page reloads where the manager could otherwise
  // reconstruct with different config.
  readonly maxDurationMs: number;
  readonly inactivityTimeoutMs: number;
  // Absolute timestamp after which the session expires from inactivity
  // (`part_end_ts + inactivityTimeoutMs`). Set on part-end; null while a
  // part is active. Checked lazily on the next part start.
  inactivityDeadlineTs: number | null;
  // User-session-scoped properties added via addProperty without
  // lifespan: 'permanent'. Persisted alongside the rest of the user-session
  // state so other tabs sharing this user session pick up the values on
  // their next part start. Keys are already prefixed with
  // KEY_PREFIX_EMB_PROPERTIES and length-limited. Cleared on user-session
  // end (state cleared).
  userSessionProperties: Record<string, string>;
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
 * `SpanSessionManager` with the part-side surface (span lifecycle, listeners,
 * counters) and the user-session attribute snapshot used by span/log
 * processors. Instrumentations, processors, and the SDK init flow take this
 * type; customer code only sees `SpanSessionManager`.
 */
export interface SpanSessionManagerInternal extends SpanSessionManager {
  getUserSessionAttributes: () => UserSessionAttributes | null;
  /**
   * Override for the OTel-standard `session.id` attribute, set via
   * `setSessionId`, or `null` when unset.
   */
  getUserSessionIdOverride: () => string | null;

  getSessionPartId: () => string | null;
  getSessionPartSpan: () => ExtendedSpan | null;

  startSessionPartInternal: (reason: SessionPartStartReason) => void;
  /**
   * Ends the active part. `reason` is the part-end reason stamped on
   * `emb.session_part_end_reason`. When `reason` is `'user_session_ended'`
   * the part is the final one of its user session (spec section 5,
   * `emb.is_final_session_part`); the optional `userSessionEndReason`
   * carries the spec's `emb.user_session_termination_reason`.
   * `userSessionEndReason` is only meaningful when `reason` is
   * `'user_session_ended'`; the implementation ignores it otherwise.
   */
  endSessionPartInternal: (
    reason: SessionPartEndReason,
    userSessionEndReason?: UserSessionEndReason,
  ) => void;

  incrSessionPartCountForKey: (key: string) => void;
  /** Same as `incrSessionPartCountForKey` but for the next part. */
  incrNextSessionPartCountForKey: (key: string) => void;

  /**
   * Listeners must not call back into part lifecycle methods
   * (`endSessionPartInternal`, `startSessionPartInternal`) synchronously.
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

export interface EmbraceSpanSessionManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  storage?: EmbraceStorage;
  config?: UserSessionConfig;
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
