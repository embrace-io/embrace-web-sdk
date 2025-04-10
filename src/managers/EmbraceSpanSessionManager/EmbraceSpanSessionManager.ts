import {
  diag,
  type DiagLogger,
  type HrTime,
  type Span,
  trace,
} from '@opentelemetry/api';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import type { SpanSessionManager } from '../../api-sessions/index.js';
import type { ReasonSessionEnded } from '../../api-sessions/manager/types.js';
import {
  KEY_EMB_SESSION_REASON_ENDED,
  KEY_PREFIX_EMB_PROPERTIES,
} from '../../constants/attributes.js';
import {
  EMB_STATES,
  EMB_TYPES,
  KEY_EMB_STATE,
  KEY_EMB_TYPE,
} from '../../constants/index.js';
import type { PerformanceManager } from '../../utils/index.js';
import { generateUUID, OTelPerformanceManager } from '../../utils/index.js';
import type { EmbraceSpanSessionManagerArgs } from './types.js';

export class EmbraceSpanSessionManager implements SpanSessionManager {
  private _activeSessionId: string | null = null;
  private _activeSessionStartTime: HrTime | null = null;
  private _sessionSpan: Span | null = null;
  private readonly _diag: DiagLogger;
  private readonly _perf: PerformanceManager;

  public constructor({
    diag: diagParam,
    perf,
  }: EmbraceSpanSessionManagerArgs = {}) {
    this._diag =
      diagParam ??
      diag.createComponentLogger({
        namespace: 'EmbraceSpanSessionManager',
      });
    this._perf = perf ?? new OTelPerformanceManager();
  }

  // the external api doesn't include a reason, and if a users uses it to end a session, the reason will be 'user_ended'
  // note: don't use this internally, this is just for user facing APIs. Use this.endSessionSpanInternal instead.
  public endSessionSpan() {
    this.endSessionSpanInternal('manual');
  }

  // endSessionSpanInternal is not part of the public API, but is used internally to end a session span adding a specific reason
  public endSessionSpanInternal(reason: ReasonSessionEnded) {
    if (!this._sessionSpan) {
      this._diag.debug(
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

  public getSessionId(): string | null {
    return this._activeSessionId;
  }

  public getSessionSpan(): Span | null {
    return this._sessionSpan;
  }

  public getSessionStartTime(): HrTime | null {
    return this._activeSessionStartTime;
  }

  public startSessionSpan() {
    //if there was a session in progress already, finish it first.
    if (this._sessionSpan) {
      this.endSessionSpanInternal('manual');
    }
    const tracer = trace.getTracer('embrace-web-sdk-sessions');
    this._activeSessionId = generateUUID();
    this._activeSessionStartTime = this._perf.getNowHRTime();
    this._sessionSpan = tracer.startSpan('emb-session', {
      attributes: {
        [KEY_EMB_TYPE]: EMB_TYPES.Session,
        [KEY_EMB_STATE]: EMB_STATES.Foreground,
        [ATTR_SESSION_ID]: this._activeSessionId,
      },
    });
  }

  public addBreadcrumb(name: string) {
    if (!this._sessionSpan) {
      this._diag.debug(
        'trying to add breadcrumb to a session, but there is no session in progress. This is a no-op.'
      );
      return;
    }
    this._sessionSpan.addEvent(
      'emb-breadcrumb',
      {
        message: name,
      },
      this._perf.getNowMillis()
    );
  }

  public addProperty(key: string, value: string) {
    if (!this._sessionSpan) {
      this._diag.debug(
        'trying to add properties to a session, but there is no session in progress. This is a no-op.'
      );
      return;
    }
    this._sessionSpan.setAttribute(KEY_PREFIX_EMB_PROPERTIES + key, value);
  }
}
