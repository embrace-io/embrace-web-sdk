import {
  ProxySpanSessionManager,
  type SpanSessionManager,
} from '../../manager/index.js';
import type { SessionAPIArgs } from './types.js';
import type { ReasonSessionEnded } from '../../manager/types.js';
import type { HrTime } from '@opentelemetry/api';

export class SessionAPI implements SpanSessionManager {
  private static _instance?: SessionAPI;
  private readonly _proxySpanSessionManager;

  private constructor({ proxySpanSessionManager }: SessionAPIArgs) {
    this._proxySpanSessionManager = proxySpanSessionManager;
  }

  public static getInstance(): SessionAPI {
    if (!this._instance) {
      this._instance = new SessionAPI({
        proxySpanSessionManager: new ProxySpanSessionManager(),
      });
    }

    return this._instance;
  }

  public getSpanSessionManager: () => SpanSessionManager = () => {
    return this._proxySpanSessionManager;
  };

  public setGlobalSessionManager(sessionManager: SpanSessionManager): void {
    this._proxySpanSessionManager.setDelegate(sessionManager);
  }

  public endSessionSpan() {
    this.getSpanSessionManager().endSessionSpan();
  }

  public endSessionSpanInternal(reason: ReasonSessionEnded) {
    this.getSpanSessionManager().endSessionSpanInternal(reason);
  }

  public getSessionId(): string | null {
    return this.getSpanSessionManager().getSessionId();
  }

  public getSessionSpan() {
    return this.getSpanSessionManager().getSessionSpan();
  }

  public getSessionStartTime(): HrTime | null {
    return this.getSpanSessionManager().getSessionStartTime();
  }

  public startSessionSpan() {
    this.getSpanSessionManager().startSessionSpan();
  }

  public addBreadcrumb(name: string): void {
    this.getSpanSessionManager().addBreadcrumb(name);
  }
}
