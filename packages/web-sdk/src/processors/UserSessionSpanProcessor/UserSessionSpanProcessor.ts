import type { DiagLogger, Span } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import {
  ATTR_SESSION_ID,
  ATTR_SESSION_PREVIOUS_ID,
} from '@opentelemetry/semantic-conventions/incubating';
import type { SessionPartManager } from '../../api-sessions/index.ts';
import {
  EMB_TYPES,
  KEY_EMB_SESSION_PART_ID,
  KEY_EMB_TYPE,
  KEY_EMB_USER_SESSION_ID,
  KEY_EMB_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS,
  KEY_EMB_USER_SESSION_MAX_DURATION_SECONDS,
  KEY_EMB_USER_SESSION_NUMBER,
  KEY_EMB_USER_SESSION_PART_NUMBER,
  KEY_EMB_USER_SESSION_PREVIOUS_ID,
  KEY_EMB_USER_SESSION_START_TS,
} from '../../constants/index.ts';
import type { UserSessionLifecycleManager } from '../../managers/EmbraceUserSessionManager/index.ts';
import type { UserSessionSpanProcessorArgs } from './types.ts';

export class UserSessionSpanProcessor implements SpanProcessor {
  private readonly _userSessionManager: UserSessionLifecycleManager;
  private readonly _sessionPartManager: SessionPartManager;
  private readonly _diag: DiagLogger;

  public constructor({
    userSessionManager,
    sessionPartManager,
  }: UserSessionSpanProcessorArgs) {
    this._userSessionManager = userSessionManager;
    this._sessionPartManager = sessionPartManager;
    this._diag = diag.createComponentLogger({
      namespace: 'UserSessionSpanProcessor',
    });
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  // Snapshot user-session attribution at span start. A user-session
  // termination during the span's lifetime (cross-tab storage event or
  // max-duration rollover) clears the manager's in-memory state before the
  // span finalizes; without a snapshot, onEnd would overwrite the legitimate
  // attribution with empty strings.
  public onStart(span: Span): void {
    try {
      const ids = this._userSessionManager.getSessionIds();
      const hasPartId = this._sessionPartManager.getSessionPartId() !== null;
      span.setAttribute(
        KEY_EMB_USER_SESSION_ID,
        hasPartId ? ids.userSessionId : '',
      );
      span.setAttribute(
        KEY_EMB_USER_SESSION_PREVIOUS_ID,
        hasPartId ? ids.userSessionPreviousId : '',
      );
    } catch (e) {
      span.setAttribute(KEY_EMB_USER_SESSION_ID, '');
      span.setAttribute(KEY_EMB_USER_SESSION_PREVIOUS_ID, '');
      this._diag.error('Error stamping user-session ids on span at onStart', e);
    }
  }

  public onEnd(span: ReadableSpan): void {
    try {
      const ids = this._userSessionManager.getSessionIds();
      const hasPartId = !!span.attributes[KEY_EMB_SESSION_PART_ID];

      // Prefer the values snapshotted at onStart so cross-tab termination or
      // max-duration rollover during the span's lifetime cannot strip the
      // attribution. Fall back to live values for spans that bypassed onStart
      // (e.g., direct test construction).
      const stampedId = span.attributes[KEY_EMB_USER_SESSION_ID];
      const stampedPrev = span.attributes[KEY_EMB_USER_SESSION_PREVIOUS_ID];
      const userSessionId =
        typeof stampedId === 'string'
          ? stampedId
          : hasPartId
            ? ids.userSessionId
            : '';
      const userSessionPreviousId =
        typeof stampedPrev === 'string'
          ? stampedPrev
          : hasPartId
            ? ids.userSessionPreviousId
            : '';

      span.attributes[KEY_EMB_USER_SESSION_ID] = userSessionId;
      span.attributes[KEY_EMB_USER_SESSION_PREVIOUS_ID] = userSessionPreviousId;

      // `session.id`: customer-set values on the span win. Otherwise honor the
      // setSessionId() override regardless of part state (customer-owned), and
      // fall back to the snapshotted user-session id.
      if (span.attributes[ATTR_SESSION_ID] === undefined) {
        if (ids.sessionIdOverride !== null) {
          span.attributes[ATTR_SESSION_ID] = ids.sessionIdOverride;
        } else {
          span.attributes[ATTR_SESSION_ID] = userSessionId;
        }
      }
      if (span.attributes[ATTR_SESSION_PREVIOUS_ID] === undefined) {
        span.attributes[ATTR_SESSION_PREVIOUS_ID] = userSessionPreviousId;
      }

      // The session-part span additionally carries the full user-session
      // attribute set. getUserSessionAttributes() is null only when no user
      // session is active; a session-part span only exists while one is.
      if (span.attributes[KEY_EMB_TYPE] === EMB_TYPES.SessionPart) {
        const attrs = this._userSessionManager.getUserSessionAttributes();
        if (attrs) {
          span.attributes[KEY_EMB_USER_SESSION_NUMBER] =
            attrs['emb.user_session_number'];
          span.attributes[KEY_EMB_USER_SESSION_PART_NUMBER] =
            attrs['emb.user_session_part_number'];
          span.attributes[KEY_EMB_USER_SESSION_START_TS] =
            attrs['emb.user_session_start_ts'];
          span.attributes[KEY_EMB_USER_SESSION_MAX_DURATION_SECONDS] =
            attrs['emb.user_session_max_duration_seconds'];
          span.attributes[KEY_EMB_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS] =
            attrs['emb.user_session_inactivity_timeout_seconds'];
        }
      }
    } catch (e) {
      // Stamp empty strings so the four-attribute contract holds even when
      // the manager throws; downstream consumers see a deterministic shape.
      if (span.attributes[KEY_EMB_USER_SESSION_ID] === undefined) {
        span.attributes[KEY_EMB_USER_SESSION_ID] = '';
      }
      if (span.attributes[KEY_EMB_USER_SESSION_PREVIOUS_ID] === undefined) {
        span.attributes[KEY_EMB_USER_SESSION_PREVIOUS_ID] = '';
      }
      if (span.attributes[ATTR_SESSION_ID] === undefined) {
        span.attributes[ATTR_SESSION_ID] = '';
      }
      if (span.attributes[ATTR_SESSION_PREVIOUS_ID] === undefined) {
        span.attributes[ATTR_SESSION_PREVIOUS_ID] = '';
      }
      this._diag.error(
        'Error applying user-session attributes to span at onEnd',
        e,
      );
    }
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
