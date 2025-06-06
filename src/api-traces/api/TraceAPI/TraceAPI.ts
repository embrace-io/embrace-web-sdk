import { ProxyTraceManager, type TraceManager } from '../../manager/index.js';
import type {
  ExtendedSpan,
  ExtendedSpanOptions,
  TraceAPIArgs,
} from './types.js';
import type { Context } from '@opentelemetry/api';

export class TraceAPI implements TraceManager {
  private static _instance?: TraceAPI;
  private readonly _proxyTraceManager;

  private constructor({ proxyTraceManager }: TraceAPIArgs) {
    this._proxyTraceManager = proxyTraceManager;
  }

  public static getInstance(): TraceAPI {
    if (!this._instance) {
      this._instance = new TraceAPI({
        proxyTraceManager: new ProxyTraceManager(),
      });
    }

    return this._instance;
  }

  public getTraceManager: () => TraceManager = () => {
    return this._proxyTraceManager;
  };

  public setGlobalTraceManager(traceManager: TraceManager): void {
    this._proxyTraceManager.setDelegate(traceManager);
  }

  public startSpan(
    name: string,
    options?: ExtendedSpanOptions,
    context?: Context
  ): ExtendedSpan {
    return this.getTraceManager().startSpan(name, options, context);
  }

  public setSpan(context: Context, span: ExtendedSpan): Context {
    return this.getTraceManager().setSpan(context, span);
  }

  public getSpan(context: Context): ExtendedSpan | undefined {
    return this.getTraceManager().getSpan(context);
  }
}
