import type { ExtendedSpan } from '../../../index.ts';
import type {
  UserSessionAttributes,
  UserSessionManagerInternal,
} from '../../../managers/EmbraceUserSessionManager/types.ts';
import type {
  PropertyOptions,
  SessionPartEndReason,
  SessionPartStartReason,
  UserSessionEndReason,
} from '../index.ts';

export class NoOpUserSessionManager implements UserSessionManagerInternal {
  public addBreadcrumb(_name: string): void {
    // do nothing.
  }

  public addProperty(
    _key: string,
    _value: string,
    _options?: PropertyOptions,
  ): void {
    // do nothing.
  }

  public removeProperty(_key: string): void {
    // do nothing.
  }

  public endSessionSpan(): void {
    // do nothing.
  }

  public currentSessionAsReadableSpan(): null {
    return null;
  }

  public getSessionId = () => null;

  public getPreviousSessionId = () => null;

  public getSessionSpan(): null {
    return null;
  }

  public getSessionStartTime(): null {
    return null;
  }

  public startSessionSpan(): void {
    // do nothing.
  }

  public addSessionStartedListener(_listener: () => void): () => void {
    return () => {};
  }

  public addSessionEndedListener(_listener: () => void): () => void {
    return () => {};
  }

  public getUserSessionId(): string | null {
    return null;
  }

  public getPreviousUserSessionId(): string | null {
    return null;
  }

  public getUserSessionStartTime(): number | null {
    return null;
  }

  public getUserSessionAttributes(): UserSessionAttributes | null {
    return null;
  }

  public getSessionPartProperties(): Record<string, string> {
    return {};
  }

  public endUserSession(): void {}

  public getSessionPartId(): string | null {
    return null;
  }

  public getSessionPartSpan(): ExtendedSpan | null {
    return null;
  }

  public startSessionPartInternal(_reason: SessionPartStartReason): void {}

  public endSessionPartInternal(
    _reason: SessionPartEndReason,
    _userSessionEndReason?: UserSessionEndReason | null,
  ): void {}

  public incrSessionPartCountForKey(_key: string): void {}

  public incrNextSessionPartCountForKey(_key: string): void {}

  public addSessionPartStartedListener(_listener: () => void): () => void {
    return () => {};
  }

  public addSessionPartEndedListener(_listener: () => void): () => void {
    return () => {};
  }

  public setTracerProvider(): void {}
}
