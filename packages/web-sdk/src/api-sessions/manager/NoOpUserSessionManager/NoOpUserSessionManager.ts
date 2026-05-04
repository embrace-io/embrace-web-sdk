import type { HrTime } from '@opentelemetry/api';
import type { ExtendedSpan } from '../../../index.ts';
import type {
  UserSessionAttributes,
  UserSessionManagerInternal,
} from '../../../managers/EmbraceUserSessionManager/types.ts';
import type {
  PropertyOptions,
  SessionPartEndReason,
  SessionPartStartReason,
} from '../index.ts';

/**
 * No-op implementation of `UserSessionManagerInternal`. Used as the pre-init
 * stand-in inside `ProxyUserSessionManager` and `SessionAPI`, and as a safe
 * default whenever code holds a manager handle before the real
 * `EmbraceUserSessionManager` is wired in.
 */
export class NoOpUserSessionManager implements UserSessionManagerInternal {
  getUserSessionId(): string | null {
    return null;
  }
  getPreviousUserSessionId(): string | null {
    return null;
  }
  getUserSessionStartTime(): number | null {
    return null;
  }
  getUserSessionAttributes(): UserSessionAttributes | null {
    return null;
  }
  getUserSessionIdOverride(): string | null {
    return null;
  }

  endUserSession(): void {}
  setSessionId(_id: string | null): void {}

  addUserSessionStartedListener(_listener: () => void): () => void {
    return () => {};
  }
  addUserSessionEndedListener(_listener: () => void): () => void {
    return () => {};
  }

  addBreadcrumb(_name: string): void {}
  addProperty(_key: string, _value: string, _options?: PropertyOptions): void {}
  removeProperty(_key: string): void {}

  getSessionPartId(): string | null {
    return null;
  }
  getSessionPartStartTime(): HrTime | null {
    return null;
  }
  getSessionPartSpan(): ExtendedSpan | null {
    return null;
  }

  startSessionPart(_reason?: SessionPartStartReason): void {}
  endSessionPart(): void {}
  endSessionPartInternal(_reason: SessionPartEndReason): void {}

  incrSessionPartCountForKey(_key: string): void {}
  incrNextSessionPartCountForKey(_key: string): void {}

  addSessionPartStartedListener(_listener: () => void): () => void {
    return () => {};
  }
  addSessionPartEndedListener(_listener: () => void): () => void {
    return () => {};
  }

  setTracerProvider(): void {}

  getSessionId(): string | null {
    return null;
  }
  getPreviousSessionId(): string | null {
    return null;
  }
  getSessionStartTime(): HrTime | null {
    return null;
  }
  endSessionSpan(): void {}
  getSessionSpan(): ExtendedSpan | null {
    return null;
  }
  addSessionStartedListener(_listener: () => void): () => void {
    return () => {};
  }
  addSessionEndedListener(_listener: () => void): () => void {
    return () => {};
  }
}
