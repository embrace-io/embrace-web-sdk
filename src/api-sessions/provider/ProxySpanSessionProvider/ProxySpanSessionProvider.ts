import {SpanSessionProvider} from '../types';
import {NoOpSpanSessionProvider} from '../NoOpSpanSessionProvider';

const NOOP_SPAN_SESSION_PROVIDER = new NoOpSpanSessionProvider();

export class ProxySpanSessionProvider implements SpanSessionProvider {
  private _delegate?: SpanSessionProvider;

  getDelegate(): SpanSessionProvider {
    return this._delegate || NOOP_SPAN_SESSION_PROVIDER;
  }

  setDelegate(delegate: SpanSessionProvider): void {
    this._delegate = delegate;
  }

  getSessionId(): string | null {
    return this.getDelegate().getSessionId();
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
}
