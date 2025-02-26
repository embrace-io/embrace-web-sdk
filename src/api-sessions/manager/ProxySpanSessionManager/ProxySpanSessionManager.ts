import { ReasonSessionEnded, SpanSessionManager } from '../types.js';
import { NoOpSpanSessionManager } from '../NoOpSpanSessionManager/index.js';
import { HrTime } from '@opentelemetry/api';

const NOOP_SPAN_SESSION_MANAGER = new NoOpSpanSessionManager();

export class ProxySpanSessionManager implements SpanSessionManager {
  private _delegate?: SpanSessionManager;

  getDelegate(): SpanSessionManager {
    return this._delegate || NOOP_SPAN_SESSION_MANAGER;
  }

  setDelegate(delegate: SpanSessionManager): void {
    this._delegate = delegate;
  }

  getSessionId(): string | null {
    return this.getDelegate().getSessionId();
  }

  getSessionStartTime(): HrTime | null {
    return this.getDelegate().getSessionStartTime();
  }

  getSessionSpan() {
    return this.getDelegate().getSessionSpan();
  }

  startSessionSpan() {
    this.getDelegate().startSessionSpan();
  }

  endSessionSpan() {
    this.getDelegate().endSessionSpan();
  }

  endSessionSpanInternal(reason: ReasonSessionEnded) {
    this.getDelegate().endSessionSpanInternal(reason);
  }
}
