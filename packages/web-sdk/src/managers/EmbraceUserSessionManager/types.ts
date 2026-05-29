import type { DiagLogger, TracerProvider } from '@opentelemetry/api';
import type {
  SessionPartEndReason,
  SessionPartStartReason,
  UserSessionEndReason,
  UserSessionManager,
} from '../../api-sessions/manager/types.ts';
import type { VisibilityStateDocument } from '../../common/index.ts';
import type { ExtendedSpan } from '../../index.ts';
import type { DynamicConfigManager } from '../../sdk/index.ts';
import type {
  NamespacedStorage,
  PerformanceManager,
} from '../../utils/index.ts';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.ts';

export interface UserSessionState {
  /**
   * Bumped when the shape of this blob changes incompatibly. Stored copies
   * with a mismatched version are discarded on read instead of being
   * structurally validated field-by-field.
   */
  readonly schemaVersion: number;
  readonly userSessionId: string;
  /**
   * Null on the first user session since the first visit or after a
   * permanent storage clear.
   */
  readonly previousUserSessionId: string | null;
  readonly userSessionStartTs: number;
  readonly userSessionMaxEndTs: number;
  readonly userSessionNumber: number;
  /** Bumped on every part start. */
  readonly userSessionPartIndex: number;
  /**
   * Configured values captured and locked at session creation, persisted
   * so they survive page reloads.
   */
  readonly userSessionMaxDurationSeconds: number;
  readonly userSessionInactivityTimeoutSeconds: number;
  /**
   * Frozen at session creation. Drives the live foreground part-inactivity
   * timer. Distinct from `userSessionInactivityTimeoutSeconds`, which drives
   * the lazy deadline set when a part ends.
   */
  readonly userSessionForegroundInactivityTimeoutSeconds: number;
  /**
   * Absolute timestamp after which the session expires from inactivity
   * (`part_end_ts + userSessionInactivityTimeoutSeconds * 1000`). Set on part-end;
   * null while a part is active. Checked lazily on the next part start.
   */
  readonly inactivityDeadlineTs: number | null;
  /**
   * User-session-scoped properties added via addProperty without
   * lifespan: 'permanent'. Persisted alongside the rest of the user-session
   * state so other tabs sharing this user session pick up the values on
   * their next part start. Keys are bare (no emb.properties. prefix) and
   * length-limited; PropertySpanProcessor applies the wire-format prefix
   * when stamping the part span. Cleared on user-session end.
   */
  readonly userSessionProperties: Record<string, string>;
}

/** Attributes emitted by the user-session layer. */
export interface UserSessionAttributes {
  readonly 'emb.user_session_id': string;
  /** OTel standard alias for `emb.user_session_id`. */
  readonly 'session.id': string;
  /** Empty string on the first user session for this browser. */
  readonly 'emb.user_session_previous_id': string;
  /** OTel standard alias for `emb.user_session_previous_id`. */
  readonly 'session.previous_id': string;
  /** Monotonic from 1 across all visits by this browser. */
  readonly 'emb.user_session_number': number;
  /** 1-indexed within the user session. */
  readonly 'emb.user_session_part_index': number;
  /** Monotonic from 1 across all visits by this browser; bumps per part. */
  readonly 'emb.session_part_number': number;
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
 * counters) used by span/log processors. Instrumentations, processors, and
 * the SDK init flow take this type; customer code only sees
 * `UserSessionManager`.
 */
export interface UserSessionManagerInternal extends UserSessionManager {
  getUserSessionAttributes: () => UserSessionAttributes | null;

  /**
   * Merged bare-keyed property map for the active part. The wire-format
   * prefix is applied by PropertySpanProcessor when stamping the part span.
   */
  getSessionPartProperties: () => Record<string, string>;

  getSessionPartId: () => string | null;
  getSessionPartSpan: () => ExtendedSpan | null;

  startSessionPartInternal: (reason: SessionPartStartReason) => void;
  /**
   * Ends the active part. `reason` is the part-end reason.
   * `userSessionEndReason` is only meaningful when the reason ends the
   * user session (`user_session_ended` or `inactivity`); the implementation
   * ignores it otherwise.
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
  addSessionPartEndedListener: (listener: () => void) => () => void;

  /**
   * Wires the tracer provider after construction; required before the
   * first part start.
   */
  setTracerProvider: (tracerProvider: TracerProvider) => void;
}

export interface EmbraceUserSessionManagerArgs {
  diag?: DiagLogger;
  perf: PerformanceManager;
  storage: NamespacedStorage;
  /**
   * Source of the user-session durations (max duration, inactivity timeout),
   * which are driven by remote config and resolved at each session creation.
   */
  dynamicConfigManager: DynamicConfigManager;
  /**
   * Document-shaped object used to gate part start/end on visibility +
   * focus.
   */
  visibilityDoc: VisibilityStateDocument;
  /**
   * Limit manager used for property/breadcrumb truncation and
   * dropped-record counting.
   */
  limitManager: LimitManagerInternal;
  /**
   * Where the manager attaches keyboard/mouse/scroll/page-lifecycle
   * listeners that drive session-part lifecycle. Defaults to `window`.
   */
  target?: EventTarget;
  /**
   * Upper bound on how often the activity handler runs; prevents
   * mousemove from re-arming the inactivity timer for every sub-second event.
   */
  activityThrottleMs?: number;
  /**
   * Input events that count as user interaction with a foreground tab.
   */
  activityEvents?: ReadonlyArray<string>;
}
