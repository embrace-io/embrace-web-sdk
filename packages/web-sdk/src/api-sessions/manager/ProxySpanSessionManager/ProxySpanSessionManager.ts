import type { HrTime } from '@opentelemetry/api';
import type {
  PropertyOptions,
  ReasonSessionEnded,
  SpanSessionManager,
  StartSessionOptions,
} from '../index.ts';
import { NoOpSpanSessionManager } from '../NoOpSpanSessionManager/index.ts';

const NOOP_SPAN_SESSION_MANAGER = new NoOpSpanSessionManager();

export class ProxySpanSessionManager implements SpanSessionManager {
  private _delegate?: SpanSessionManager;

  public getDelegate(): SpanSessionManager {
    return this._delegate ?? NOOP_SPAN_SESSION_MANAGER;
  }

  public setDelegate(delegate: SpanSessionManager): void {
    this._delegate = delegate;
  }

  public addBreadcrumb(name: string): void {
    this.getDelegate().addBreadcrumb(name);
  }

  public addProperty(
    key: string,
    value: string,
    options?: PropertyOptions,
  ): void {
    this.getDelegate().addProperty(key, value, options);
  }

  public removeProperty(key: string): void {
    this.getDelegate().removeProperty(key);
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

  public getPreviousSessionId(): string | null {
    return this.getDelegate().getPreviousSessionId();
  }

  public getSessionSpan() {
    return this.getDelegate().getSessionSpan();
  }

  public getSessionStartTime(): HrTime | null {
    return this.getDelegate().getSessionStartTime();
  }

  public startSessionSpan(options?: StartSessionOptions) {
    this.getDelegate().startSessionSpan(options);
  }

  public addSessionStartedListener(listener: () => void): () => void {
    return this.getDelegate().addSessionStartedListener(listener);
  }

  public addSessionEndedListener(listener: () => void): () => void {
    return this.getDelegate().addSessionEndedListener(listener);
  }
}
