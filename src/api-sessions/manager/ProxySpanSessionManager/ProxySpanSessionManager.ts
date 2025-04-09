import type { HrTime } from '@opentelemetry/api';
import { NoOpSpanSessionManager } from '../NoOpSpanSessionManager/index.js';
import type { ReasonSessionEnded, SpanSessionManager } from '../types.js';

const NOOP_SPAN_SESSION_MANAGER = new NoOpSpanSessionManager();

export class ProxySpanSessionManager implements SpanSessionManager {
  private _delegate?: SpanSessionManager;

  public getDelegate(): SpanSessionManager {
    return this._delegate ?? NOOP_SPAN_SESSION_MANAGER;
  }

  public setDelegate(delegate: SpanSessionManager): void {
    this._delegate = delegate;
  }

  public endSessionSpan() {
    this.getDelegate().endSessionSpan();
  }

  public endSessionSpanInternal(reason: ReasonSessionEnded) {
    this.getDelegate().endSessionSpanInternal(reason);
  }

  public getSessionId(): string | null {
    return this.getDelegate().getSessionId();
  }

  public getSessionSpan() {
    return this.getDelegate().getSessionSpan();
  }

  public getSessionStartTime(): HrTime | null {
    return this.getDelegate().getSessionStartTime();
  }

  public startSessionSpan() {
    this.getDelegate().startSessionSpan();
  }

  public addBreadcrumb(name: string): void {
    this.getDelegate().addBreadcrumb(name);
  }
}
