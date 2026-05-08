import type { DiagLogger, Span } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
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
import type { SpanSessionManagerInternal } from '../../managers/EmbraceSpanSessionManager/index.ts';
import { applyUserSessionAttributesToSpan } from '../../utils/index.ts';
import type { UserSessionSpanProcessorArgs } from './types.ts';

export class UserSessionSpanProcessor implements SpanProcessor {
  private readonly _spanSessionManager: SpanSessionManagerInternal;
  private readonly _diag: DiagLogger;

  public constructor({ spanSessionManager }: UserSessionSpanProcessorArgs) {
    this._spanSessionManager = spanSessionManager;
    this._diag = diag.createComponentLogger({
      namespace: 'UserSessionSpanProcessor',
    });
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  // Snapshot session attribution at span start so a user-session end during
  // the span's lifetime doesn't blank the attribution at onEnd.
  public onStart(span: Span): void {
    try {
      const partId = this._spanSessionManager.getSessionPartId() ?? '';
      const hasPartId = partId !== '';
      const userSessionId = hasPartId
        ? (this._spanSessionManager.getUserSessionId() ?? '')
        : '';
      const userSessionPreviousId = hasPartId
        ? (this._spanSessionManager.getPreviousUserSessionId() ?? '')
        : '';
      span.setAttributes({
        [KEY_EMB_SESSION_PART_ID]: partId,
        [KEY_EMB_USER_SESSION_ID]: userSessionId,
        [KEY_EMB_USER_SESSION_PREVIOUS_ID]: userSessionPreviousId,
      });
    } catch (e) {
      span.setAttributes({
        [KEY_EMB_SESSION_PART_ID]: '',
        [KEY_EMB_USER_SESSION_ID]: '',
        [KEY_EMB_USER_SESSION_PREVIOUS_ID]: '',
      });
      this._diag.error('Error stamping session ids on span at onStart', e);
    }
  }

  public onEnd(span: ReadableSpan): void {
    try {
      applyUserSessionAttributesToSpan(span, this._spanSessionManager);

      // Session-part spans already carry the full user-session attribute
      // set stamped at part start; reading them back here would overwrite
      // the dying part with the rolled-over session's counters.
      if (
        span.attributes[KEY_EMB_TYPE] === EMB_TYPES.SessionPart &&
        span.attributes[KEY_EMB_USER_SESSION_NUMBER] === undefined
      ) {
        const attrs = this._spanSessionManager.getUserSessionAttributes();
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
      // Stamp every attribute the export contract requires so a manager
      // throw doesn't leave the span with a partial shape.
      if (span.attributes[KEY_EMB_USER_SESSION_ID] === undefined) {
        span.attributes[KEY_EMB_USER_SESSION_ID] = '';
      }
      if (span.attributes[KEY_EMB_USER_SESSION_PREVIOUS_ID] === undefined) {
        span.attributes[KEY_EMB_USER_SESSION_PREVIOUS_ID] = '';
      }
      if (span.attributes[ATTR_SESSION_ID] === undefined) {
        span.attributes[ATTR_SESSION_ID] = '';
      }
      this._diag.error(
        'Error applying user session attributes to span at onEnd',
        e,
      );
    }
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
