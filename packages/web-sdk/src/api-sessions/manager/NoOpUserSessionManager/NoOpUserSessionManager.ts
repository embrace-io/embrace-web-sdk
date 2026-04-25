import type { HrTime } from '@opentelemetry/api';
import type { ExtendedSpan } from '../../../index.ts';
import type {
  PropertyOptions,
  SessionPartEndReason,
  UserSessionManager,
} from '../index.ts';

export class NoOpUserSessionManager implements UserSessionManager {
  // User session identity
  getUserSessionId = () => null;
  getPreviousUserSessionId = () => null;
  getUserSessionStartTime = () => null;

  // Session part identity (read-only)
  getSessionPartId = () => null;
  getPreviousSessionPartId = () => null;

  // User session lifecycle
  endUserSession(): void {}
  setSessionId(_id: string | null): void {}

  // User session listeners
  addUserSessionStartedListener(_listener: () => void): () => void {
    return () => {};
  }
  addUserSessionEndedListener(_listener: () => void): () => void {
    return () => {};
  }

  // User session properties
  addBreadcrumb(_name: string): void {}
  addUserSessionProperty(
    _key: string,
    _value: string,
    _options?: PropertyOptions,
  ): void {}
  addPermanentUserSessionProperty(_key: string, _value: string): void {}
  removeUserSessionProperty(_key: string): void {}

  // Deprecated
  addProperty(_key: string, _value: string, _options?: PropertyOptions): void {}
  removeProperty(_key: string): void {}
  getSessionId = () => null;
  getPreviousSessionId = () => null;
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

  // Internal
  getSessionPartSpan(): ExtendedSpan | null {
    return null;
  }
  endSessionPartInternal(_reason: SessionPartEndReason): void {}
}
