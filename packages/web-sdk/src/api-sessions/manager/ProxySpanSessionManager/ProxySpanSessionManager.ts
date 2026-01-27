import type { HrTime } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
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
  private _pendingStartListeners: Array<() => void> = [];
  private _pendingEndListeners: Array<() => void> = [];

  public getDelegate(): SpanSessionManager {
    return this._delegate ?? NOOP_SPAN_SESSION_MANAGER;
  }

  public setDelegate(delegate: SpanSessionManager): void {
    this._delegate = delegate;
    // Replay pending listeners registered before delegate was set
    this._pendingStartListeners.forEach((listener) => {
      delegate.addSessionStartedListener(listener);
    });
    this._pendingEndListeners.forEach((listener) => {
      delegate.addSessionEndedListener(listener);
    });
    this._pendingStartListeners = [];
    this._pendingEndListeners = [];
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

  public currentSessionAsReadableSpan(
    reason: ReasonSessionEnded,
  ): ReadableSpan | null {
    return this.getDelegate().currentSessionAsReadableSpan(reason);
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
    if (this._delegate) {
      return this._delegate.addSessionStartedListener(listener);
    }
    // Queue for replay when delegate is set
    this._pendingStartListeners.push(listener);
    return () => {
      const idx = this._pendingStartListeners.indexOf(listener);
      if (idx >= 0) {
        this._pendingStartListeners.splice(idx, 1);
      }
    };
  }

  public addSessionEndedListener(listener: () => void): () => void {
    if (this._delegate) {
      return this._delegate.addSessionEndedListener(listener);
    }
    // Queue for replay when delegate is set
    this._pendingEndListeners.push(listener);
    return () => {
      const idx = this._pendingEndListeners.indexOf(listener);
      if (idx >= 0) {
        this._pendingEndListeners.splice(idx, 1);
      }
    };
  }
}
