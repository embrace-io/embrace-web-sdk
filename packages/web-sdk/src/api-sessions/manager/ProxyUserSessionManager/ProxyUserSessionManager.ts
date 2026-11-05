import type { TracerProvider } from '@opentelemetry/api';
import type { ExtendedSpan } from '../../../index.ts';
import type {
  EndSessionPartOptions,
  RolloverSessionPartOptions,
  StartSessionPartOptions,
  UserSessionAttributes,
  UserSessionManagerInternal,
} from '../../../managers/EmbraceUserSessionManager/types.ts';
import type { PropertyOptions, SessionPartStartedEvent } from '../index.ts';
import { NoOpUserSessionManager } from '../NoOpUserSessionManager/index.ts';

const NOOP_USER_SESSION_MANAGER = new NoOpUserSessionManager();

export class ProxyUserSessionManager implements UserSessionManagerInternal {
  private _delegate?: UserSessionManagerInternal;

  public getDelegate(): UserSessionManagerInternal {
    return this._delegate ?? NOOP_USER_SESSION_MANAGER;
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

  public getSessionPartIdAt(timestampEpochMillis: number): string | null {
    return this.getDelegate().getSessionPartIdAt(timestampEpochMillis);
  }

  public getSessionPartSpan(): ExtendedSpan | null {
    return this.getDelegate().getSessionPartSpan();
  }

  public startSessionPartInternal(options: StartSessionPartOptions): void {
    this.getDelegate().startSessionPartInternal(options);
  }

  public endSessionPartInternal(options: EndSessionPartOptions): void {
    this.getDelegate().endSessionPartInternal(options);
  }

  public rolloverSessionPartInternal(
    options: RolloverSessionPartOptions,
  ): void {
    this.getDelegate().rolloverSessionPartInternal(options);
  }

  public incrSessionPartCountForKey(key: string): void {
    this.getDelegate().incrSessionPartCountForKey(key);
  }

  public incrNextSessionPartCountForKey(key: string): void {
    this.getDelegate().incrNextSessionPartCountForKey(key);
  }

  public addSessionPartStartedListener(
    listener: (event: SessionPartStartedEvent) => void,
  ): () => void {
    return this.getDelegate().addSessionPartStartedListener(listener);
  }

  public addSessionPartEndedListener(listener: () => void): () => void {
    return this.getDelegate().addSessionPartEndedListener(listener);
  }

  public setTracerProvider(tracerProvider: TracerProvider): void {
    this.getDelegate().setTracerProvider(tracerProvider);
  }
}
