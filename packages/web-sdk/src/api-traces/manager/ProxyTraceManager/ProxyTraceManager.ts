import type { Context } from '@opentelemetry/api';
import type {
  ExtendedSpan,
  ExtendedSpanOptions,
} from '../../api/TraceAPI/types.ts';
import { NoOpTraceManager } from '../NoOpTraceManager/NoOpTraceManager.ts';
import type { TraceManager } from '../types.ts';

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
    options?: ExtendedSpanOptions,
    context?: Context,
  ): ExtendedSpan {
    return this.getDelegate().startSpan(name, options, context);
  }

  public setSpan(context: Context, span: ExtendedSpan): Context {
    return this.getDelegate().setSpan(context, span);
  }

  public getSpan(context: Context): ExtendedSpan | undefined {
    return this.getDelegate().getSpan(context);
  }
}
