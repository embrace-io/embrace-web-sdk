import type { HrTime } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import type {
  PropertyOptions,
  ReasonSessionEnded,
  SpanSessionManager,
  StartSessionOptions,
} from '../../manager/index.js';
import { ProxySpanSessionManager } from '../../manager/index.js';
import type { SessionAPIArgs } from './types.js';

export class SessionAPI implements SpanSessionManager {
  private static _instance?: SessionAPI;
  private readonly _proxySpanSessionManager;

  private constructor({ proxySpanSessionManager }: SessionAPIArgs) {
    this._proxySpanSessionManager = proxySpanSessionManager;
  }

  public static getInstance(): SessionAPI {
    if (!SessionAPI._instance) {
      SessionAPI._instance = new SessionAPI({
        proxySpanSessionManager: new ProxySpanSessionManager(),
      });
    }

    return SessionAPI._instance;
  }

  public getSpanSessionManager: () => SpanSessionManager = () => {
    return this._proxySpanSessionManager;
  };

  public setGlobalSessionManager(sessionManager: SpanSessionManager): void {
    this._proxySpanSessionManager.setDelegate(sessionManager);
  }

  public addBreadcrumb(name: string): void {
    this.getSpanSessionManager().addBreadcrumb(name);
  }

  public addProperty(
    key: string,
    value: string,
    options?: PropertyOptions,
  ): void {
    this.getSpanSessionManager().addProperty(key, value, options);
  }

  public removeProperty(key: string): void {
    this.getSpanSessionManager().removeProperty(key);
  }

  public endSessionSpan() {
    this.getSpanSessionManager().endSessionSpan();
  }

  public endSessionSpanInternal(reason: ReasonSessionEnded) {
    this.getSpanSessionManager().endSessionSpanInternal(reason);
  }

  public currentSessionAsReadableSpan(
    reason: ReasonSessionEnded,
  ): ReadableSpan | null {
    return this.getSpanSessionManager().currentSessionAsReadableSpan(reason);
  }

  public getSessionId(): string | null {
    return this.getSpanSessionManager().getSessionId();
  }

  public getPreviousSessionId(): string | null {
    return this.getSpanSessionManager().getPreviousSessionId();
  }

  public getSessionSpan() {
    return this.getSpanSessionManager().getSessionSpan();
  }

  public getSessionStartTime(): HrTime | null {
    return this.getSpanSessionManager().getSessionStartTime();
  }

  public startSessionSpan(options?: StartSessionOptions) {
    this.getSpanSessionManager().startSessionSpan(options);
  }

  public addSessionStartedListener(listener: () => void): () => void {
    return this.getSpanSessionManager().addSessionStartedListener(listener);
  }

  public addSessionEndedListener(listener: () => void): () => void {
    return this.getSpanSessionManager().addSessionEndedListener(listener);
  }
}
