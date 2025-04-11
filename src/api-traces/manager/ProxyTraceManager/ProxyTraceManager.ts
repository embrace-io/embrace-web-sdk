import type { Span, SpanOptions } from '@opentelemetry/api';
import type { TraceManager } from '../index.js';
import { NoOpTraceManager } from '../NoOpTraceManager/index.js';

const NOOP_TRACE_MANAGER = new NoOpTraceManager();

export class ProxyTraceManager implements TraceManager {
  private _delegate?: TraceManager;

  public getDelegate(): TraceManager {
    return this._delegate ?? NOOP_TRACE_MANAGER;
  }

  public setDelegate(delegate: TraceManager): void {
    this._delegate = delegate;
  }

  public startPerformanceSpan(
    name: string,
    options?: SpanOptions
  ): Span | null {
    return this.getDelegate().startPerformanceSpan(name, options);
  }
}
