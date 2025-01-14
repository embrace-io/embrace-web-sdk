import {Span, trace} from '@opentelemetry/api';
import {EMB_TYPES, KEY_EMB_TYPE} from '../../constants/attributes';
import {ATTR_SESSION_ID} from '@opentelemetry/semantic-conventions/incubating';
import {SpanSessionProvider} from '../../api-sessions';
import generateUUID from '../../utils/generateUUID';

class EmbraceSpanSessionProvider implements SpanSessionProvider {
  private _activeSessionId: string | null = null;
  private _sessionSpan: Span | null = null;

  getSessionId(): string | null {
    return this._activeSessionId;
  }

  getSessionSpan(): Span | null {
    return this._sessionSpan;
  }

  startSessionSpan() {
    const tracer = trace.getTracer('embrace-web-sdk-sessions');
    this._sessionSpan = tracer.startSpan('emb-session');
    this._activeSessionId = generateUUID();
    this._sessionSpan.setAttributes({
      [KEY_EMB_TYPE]: EMB_TYPES.Session,
      [ATTR_SESSION_ID]: this._activeSessionId,
    });
  }

  endSessionSpan() {
    this._sessionSpan?.end();
    this._sessionSpan = null;
    this._activeSessionId = null;
  }
}

export default EmbraceSpanSessionProvider;
