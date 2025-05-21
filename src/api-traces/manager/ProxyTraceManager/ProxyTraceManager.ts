import type { TraceManager } from '../index.js';
import { NoOpTraceManager } from '../NoOpTraceManager/index.js';
import type {
  PerformanceSpan,
  PerformanceSpanOptions,
} from '../../api/index.js';

const NOOP_TRACE_MANAGER = new NoOpTraceManager();

export class ProxyTraceManager implements TraceManager {
  private _delegate?: TraceManager;

  public getDelegate(): TraceManager {
    return this._delegate ?? NOOP_TRACE_MANAGER;
  }

  public setDelegate(delegate: TraceManager): void {
    this._delegate = delegate;
  }

  public startSpan(
    name: string,
    options?: PerformanceSpanOptions
  ): PerformanceSpan | null {
    return this.getDelegate().startSpan(name, options);
  }
}
