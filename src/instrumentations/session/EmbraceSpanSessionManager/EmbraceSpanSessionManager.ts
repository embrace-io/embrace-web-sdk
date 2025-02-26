import { HrTime, Span, trace } from '@opentelemetry/api';
import {
  EMB_STATES,
  EMB_TYPES,
  KEY_EMB_STATE,
  KEY_EMB_TYPE,
} from '../../../constants/index.js';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import { generateUUID, getNowHRTime } from '../../../utils/index.js';
import { KEY_EMB_SESSION_REASON_ENDED } from '../../../constants/attributes.js';
import { SpanSessionManager } from '../../../api-sessions/index.js';
import { ReasonSessionEnded } from '../../../api-sessions/manager/types.js';

export class EmbraceSpanSessionManager implements SpanSessionManager {
  private _activeSessionId: string | null = null;
  private _activeSessionStartTime: HrTime | null = null;
  private _sessionSpan: Span | null = null;

  getSessionId(): string | null {
    return this._activeSessionId;
  }

  getSessionStartTime(): HrTime | null {
    return this._activeSessionStartTime;
  }

  getSessionSpan(): Span | null {
    return this._sessionSpan;
  }

  startSessionSpan() {
    //if there was a session in progress already, finish it first.
    if (this._sessionSpan) {
      this.endSessionSpanInternal('new_session_started');
    }
    const tracer = trace.getTracer('embrace-web-sdk-sessions');
    this._activeSessionId = generateUUID();
    this._activeSessionStartTime = getNowHRTime();
    this._sessionSpan = tracer.startSpan('emb-session', {
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.Session,
        [KEY_EMB_STATE]: EMB_STATES.Foreground,
        [ATTR_SESSION_ID]: this._activeSessionId,
      },
    });
  }

  // endSessionSpanInternal is not part of the public API, but is used internally to end a session span adding a specific reason
  // the external api doesn't include a reason, and if a users uses it to end a session, the reason will be 'user_ended'
  endSessionSpanInternal(reason: ReasonSessionEnded) {
    if (!this._sessionSpan) {
      console.log(
        'trying to end a session, but there is no session in progress. This is a no-op.'
      );
      return;
    }
    this._sessionSpan.setAttribute(KEY_EMB_SESSION_REASON_ENDED, reason);
    this._sessionSpan.end();
    this._sessionSpan = null;
    this._activeSessionStartTime = null;
    this._activeSessionId = null;
  }

  // note: don't use this internally, this is just for user facing APIs. Use thi.endSessionSpanInternal instead.
  endSessionSpan() {
    this.endSessionSpanInternal('user_ended');
  }
}
