import type { ExtendedSpan } from '../../../index.ts';
import type {
  EndSessionPartOptions,
  RolloverSessionPartOptions,
  StartSessionPartOptions,
  UserSessionAttributes,
  UserSessionManagerInternal,
} from '../../../managers/EmbraceUserSessionManager/types.ts';
import type { PropertyOptions, SessionPartStartedEvent } from '../index.ts';

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

  public getSessionPartIdAt(_timestampEpochMillis: number): string | null {
    return null;
  }

  public getSessionPartSpan(): ExtendedSpan | null {
    return null;
  }

  public startSessionPartInternal(_options: StartSessionPartOptions): void {}

  public endSessionPartInternal(_options: EndSessionPartOptions): void {}

  public rolloverSessionPartInternal(
    _options: RolloverSessionPartOptions,
  ): void {}

  public incrSessionPartCountForKey(_key: string): void {}

  public incrNextSessionPartCountForKey(_key: string): void {}

  public addSessionPartStartedListener(
    _listener: (event: SessionPartStartedEvent) => void,
  ): () => void {
    return () => {};
  }

  public addSessionPartEndedListener(_listener: () => void): () => void {
    return () => {};
  }

  public setTracerProvider(): void {}
}
