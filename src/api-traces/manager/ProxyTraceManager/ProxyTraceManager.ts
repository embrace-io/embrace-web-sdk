import type { Span, SpanOptions } from '@opentelemetry/api';
import { NoOpTraceManager } from '../NoOpTraceManager/index.js';
import type { TraceManager } from '../types.js';

const NOOP_TRACE_MANAGER = new NoOpTraceManager();

export class ProxyTraceManager implements TraceManager {
  private _delegate?: TraceManager;

  public getDelegate(): TraceManager {
    return this._delegate ?? NOOP_TRACE_MANAGER;
  }

  public setDelegate(delegate: TraceManager): void {
    this._delegate = delegate;
  }

  public startSpan(name: string, options?: SpanOptions): Span | null {
    return this.getDelegate().startSpan(name, options);
  }
}
