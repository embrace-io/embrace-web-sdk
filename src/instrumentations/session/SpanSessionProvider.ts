import {SessionProvider} from '@opentelemetry/web-common';
import {Span, trace} from '@opentelemetry/api';
import generateUUID from '../../utils/generateUUID';
import {EMB_SESSION, EMB_TYPE} from '../../constants/attributes';
import {ATTR_SESSION_ID} from '@opentelemetry/semantic-conventions/incubating';

const tracer = trace.getTracer('embrace-web-sdk-sessions');

class SpanSessionProvider implements SessionProvider {
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
    tracer.startSpan('emb-session');

    this._sessionSpan = tracer.startSpan('emb-session');
    this._sessionSpan.setAttributes({
      [EMB_TYPE]: EMB_SESSION,
      [ATTR_SESSION_ID]: this._activeSessionId,
    });
  }

  endSessionSpan() {
    this._sessionSpan?.end();
    this._sessionSpan = null;
  }
}

export default SpanSessionProvider;
