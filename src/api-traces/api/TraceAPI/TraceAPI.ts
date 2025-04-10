import type { Span, SpanOptions } from '@opentelemetry/api';
import { ProxyTraceManager, type TraceManager } from '../../manager/index.js';
import type { TraceAPIArgs } from './types.js';

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

  public startPerformanceSpan(
    name: string,
    options?: SpanOptions
  ): Span | null {
    return this.getTraceManager().startPerformanceSpan(name, options);
  }
}
