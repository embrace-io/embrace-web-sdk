import type { TracerProvider } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ExtendedSpan } from '../../../index.ts';
import type {
  UserSessionAttributes,
  UserSessionManagerInternal,
} from '../../../managers/EmbraceUserSessionManager/types.ts';
import type {
  PropertyOptions,
  ReasonSessionEnded,
  SessionPartEndReason,
  SessionPartStartReason,
  StartSessionOptions,
  UserSessionEndReason,
} from '../index.ts';
import { NoOpUserSessionManager } from '../NoOpUserSessionManager/index.ts';

const NOOP_USER_SESSION_MANAGER = new NoOpUserSessionManager();
const PROXY_DIAG = diag.createComponentLogger({
  namespace: 'ProxyUserSessionManager',
});

export class ProxyUserSessionManager implements UserSessionManagerInternal {
  private _delegate?: UserSessionManagerInternal;

  public getDelegate(): UserSessionManagerInternal {
    if (!this._delegate) {
      PROXY_DIAG.debug('called before initSDK(); using no-op');
      return NOOP_USER_SESSION_MANAGER;
    }
    return this._delegate;
  }

  public setDelegate(delegate: UserSessionManagerInternal): void {
    this._delegate = delegate;
  }

  public addBreadcrumb(name: string): void {
    this.getDelegate().addBreadcrumb(name);
  }

  public addProperty(
    key: string,
    value: string,
    options?: PropertyOptions,
  ): void {
    this.getDelegate().addProperty(key, value, options);
  }

  public removeProperty(key: string): void {
    this.getDelegate().removeProperty(key);
  }

  public endSessionSpan() {
    this.getDelegate().endSessionSpan();
  }

  /** @deprecated Will be removed in a future major version, always returns null. */
  public currentSessionAsReadableSpan(reason: ReasonSessionEnded): null {
    return this.getDelegate().currentSessionAsReadableSpan(reason);
  }

  /** @deprecated Will be removed in a future version, use getUserSessionId(); returns null when no user session is active. */
  public getSessionId(): string | null {
    return this.getDelegate().getSessionId();
  }

  /** @deprecated Will be removed in a future version, always returns null. Use getPreviousUserSessionId(). */
  public getPreviousSessionId(): null {
    return null;
  }

  /** @deprecated Will be removed in a future version, use getSessionPartSpan(); returns null when no part is active. */
  public getSessionSpan() {
    return this.getDelegate().getSessionSpan();
  }

  /** @deprecated Will be removed in a future version, use getUserSessionStartTime(); returns null when no user session is active. */
  public getSessionStartTime(): number | null {
    return this.getDelegate().getSessionStartTime();
  }

  /** @deprecated Will be removed in a future version, no-op. */
  public startSessionSpan(_options?: StartSessionOptions) {}

  /** @deprecated Will be removed in a future version, the returned unsubscribe is a no-op. */
  public addSessionStartedListener(_listener: () => void): () => void {
    return () => {};
  }

  /** @deprecated Will be removed in a future version, the returned unsubscribe is a no-op. */
  public addSessionEndedListener(_listener: () => void): () => void {
    return () => {};
  }

  public getUserSessionId(): string | null {
    return this.getDelegate().getUserSessionId();
  }

  public getPreviousUserSessionId(): string | null {
    return this.getDelegate().getPreviousUserSessionId();
  }

  public getUserSessionStartTime(): number | null {
    return this.getDelegate().getUserSessionStartTime();
  }

  public endUserSession(): void {
    this.getDelegate().endUserSession();
  }

  public getUserSessionAttributes(): UserSessionAttributes | null {
    return this.getDelegate().getUserSessionAttributes();
  }

  public getSessionPartProperties(): Record<string, string> {
    return this.getDelegate().getSessionPartProperties();
  }

  public getSessionPartId(): string | null {
    return this.getDelegate().getSessionPartId();
  }

  public getSessionPartSpan(): ExtendedSpan | null {
    return this.getDelegate().getSessionPartSpan();
  }

  public startSessionPartInternal(reason: SessionPartStartReason): void {
    this.getDelegate().startSessionPartInternal(reason);
  }

  public endSessionPartInternal(
    reason: SessionPartEndReason,
    userSessionEndReason?: UserSessionEndReason,
  ): void {
    this.getDelegate().endSessionPartInternal(reason, userSessionEndReason);
  }

  public incrSessionPartCountForKey(key: string): void {
    this.getDelegate().incrSessionPartCountForKey(key);
  }

  public incrNextSessionPartCountForKey(key: string): void {
    this.getDelegate().incrNextSessionPartCountForKey(key);
  }

  public addSessionPartStartedListener(listener: () => void): () => void {
    return this.getDelegate().addSessionPartStartedListener(listener);
  }

  public addSessionPartEndedListener(listener: () => void): () => void {
    return this.getDelegate().addSessionPartEndedListener(listener);
  }

  public setTracerProvider(tracerProvider: TracerProvider): void {
    this.getDelegate().setTracerProvider(tracerProvider);
  }
}
