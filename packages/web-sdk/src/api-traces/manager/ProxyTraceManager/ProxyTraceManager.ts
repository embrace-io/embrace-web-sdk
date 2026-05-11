import type { Context } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ExtendedSpan, ExtendedSpanOptions } from '../../api/index.ts';
import type { TraceManager } from '../index.ts';
import { NoOpTraceManager } from '../NoOpTraceManager/index.ts';

const NOOP_TRACE_MANAGER = new NoOpTraceManager();
const PROXY_DIAG = diag.createComponentLogger({
  namespace: 'ProxyTraceManager',
});

export class ProxyTraceManager implements TraceManager {
  private _delegate?: TraceManager;

  public getDelegate(): TraceManager {
    if (!this._delegate) {
      PROXY_DIAG.debug('called before initSDK(); using no-op');
      return NOOP_TRACE_MANAGER;
    }
    return this._delegate;
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
