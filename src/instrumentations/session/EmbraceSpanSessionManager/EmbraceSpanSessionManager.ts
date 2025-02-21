import { Span, trace } from '@opentelemetry/api';
import {
  EMB_STATES,
  EMB_TYPES,
  KEY_EMB_STATE,
  KEY_EMB_TYPE,
} from '../../../constants/index.js';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import { type SpanSessionManager } from '../../../api-sessions/index.js';
import { generateUUID } from '../../../utils/index.js';

export class EmbraceSpanSessionManager implements SpanSessionManager {
  private _activeSessionId: string | null = null;
  private _sessionSpan: Span | null = null;

  getSessionId(): string | null {
    return this._activeSessionId;
  }

  getSessionSpan(): Span | null {
    return this._sessionSpan;
  }

  startSessionSpan() {
    //if there was a session in progress already, finish it first.
    if (this._sessionSpan) {
      this.endSessionSpan();
    }
    const tracer = trace.getTracer('embrace-web-sdk-sessions');
    this._sessionSpan = tracer.startSpan('emb-session');
    this._activeSessionId = generateUUID();
    this._sessionSpan.setAttributes({
      [KEY_EMB_TYPE]: EMB_TYPES.Session,
      [KEY_EMB_STATE]: EMB_STATES.Foreground,
      [ATTR_SESSION_ID]: this._activeSessionId,
    });
  }

  endSessionSpan() {
    this._sessionSpan?.end();
    this._sessionSpan = null;
    this._activeSessionId = null;
  }
}
