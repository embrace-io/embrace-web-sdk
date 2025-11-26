import type { HrTime } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { SafeCaller } from '../../../utils';
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
  private readonly _safe: SafeCaller;
  private readonly _proxySpanSessionManager;

  private constructor({ proxySpanSessionManager }: SessionAPIArgs) {
    this._proxySpanSessionManager = proxySpanSessionManager;
    this._safe = new SafeCaller(
      diag.createComponentLogger({
        namespace: 'SessionAPI',
      }),
    );
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
    this._safe.invoke(() => this.getSpanSessionManager().addBreadcrumb(name));
  }

  public addProperty(
    key: string,
    value: string,
    options?: PropertyOptions,
  ): void {
    this._safe.invoke(() =>
      this.getSpanSessionManager().addProperty(key, value, options),
    );
  }

  public removeProperty(key: string): void {
    this._safe.invoke(() => this.getSpanSessionManager().removeProperty(key));
  }

  public endSessionSpan() {
    this._safe.invoke(() => this.getSpanSessionManager().endSessionSpan());
  }

  public endSessionSpanInternal(reason: ReasonSessionEnded) {
    this._safe.invoke(() =>
      this.getSpanSessionManager().endSessionSpanInternal(reason),
    );
  }

  public currentSessionAsReadableSpan(
    reason: ReasonSessionEnded,
  ): ReadableSpan | null {
    return this._safe.invokeWithReturn(
      () => this.getSpanSessionManager().currentSessionAsReadableSpan(reason),
      null,
    );
  }

  public getSessionId(): string | null {
    return this._safe.invokeWithReturn(
      () => this.getSpanSessionManager().getSessionId(),
      null,
    );
  }

  public getPreviousSessionId(): string | null {
    return this._safe.invokeWithReturn(
      () => this.getSpanSessionManager().getPreviousSessionId(),
      null,
    );
  }

  public getSessionSpan() {
    return this._safe.invokeWithReturn(
      () => this.getSpanSessionManager().getSessionSpan(),
      null,
    );
  }

  public getSessionStartTime(): HrTime | null {
    return this._safe.invokeWithReturn(
      () => this.getSpanSessionManager().getSessionStartTime(),
      null,
    );
  }

  public startSessionSpan(options?: StartSessionOptions) {
    this._safe.invoke(() =>
      this.getSpanSessionManager().startSessionSpan(options),
    );
  }

  public addSessionStartedListener(listener: () => void): () => void {
    return this._safe.invokeWithReturn(
      () => this.getSpanSessionManager().addSessionStartedListener(listener),
      () => undefined,
    );
  }

  public addSessionEndedListener(listener: () => void): () => void {
    return this._safe.invokeWithReturn(
      () => this.getSpanSessionManager().addSessionEndedListener(listener),
      () => undefined,
    );
  }
}
