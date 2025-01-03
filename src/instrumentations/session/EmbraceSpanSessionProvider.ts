import {Span, trace} from '@opentelemetry/api';
import generateUUID from '../../utils/generateUUID';
import {EMB_TYPES, KEY_EMB_TYPE} from '../../constants/attributes';
import {ATTR_SESSION_ID} from '@opentelemetry/semantic-conventions/incubating';
import {SpanSessionProvider} from '../../api-sessions';

class EmbraceSpanSessionProvider implements SpanSessionProvider {
  private readonly _activeSessionId: string;
  private _sessionSpan: Span | null = null;

  constructor() {
    this._activeSessionId = generateUUID();
  }

  getSessionId(): string | null {
    return this._activeSessionId;
  }

  getSessionSpan(): Span | null {
    return this._sessionSpan;
  }

  startSessionSpan() {
    const tracer = trace.getTracer('embrace-web-sdk-sessions');
    tracer.startSpan('emb-session');

    this._sessionSpan = tracer.startSpan('emb-session');
    this._sessionSpan.setAttributes({
      [KEY_EMB_TYPE]: EMB_TYPES.Session,
      [ATTR_SESSION_ID]: this._activeSessionId,
    });
  }

  endSessionSpan() {
    this._sessionSpan?.end();
    this._sessionSpan = null;
  }
}

export default EmbraceSpanSessionProvider;
