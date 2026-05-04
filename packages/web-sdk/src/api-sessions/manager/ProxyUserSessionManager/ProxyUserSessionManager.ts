import type { HrTime } from '@opentelemetry/api';
import type { UserSessionManagerInternal } from '../../../managers/EmbraceUserSessionManager/types.ts';
import { NoOpUserSessionManager } from '../NoOpUserSessionManager/index.ts';
import type { PropertyOptions, UserSessionManager } from '../types.ts';

// Pre-init stand-in. Replaced by the real merged manager when
// `setUserSessionManager` is called.
const NOOP_USER_SESSION_MANAGER = new NoOpUserSessionManager();

export class ProxyUserSessionManager implements UserSessionManager {
  private _userSessionManager: UserSessionManagerInternal =
    NOOP_USER_SESSION_MANAGER;

  /** @internal SDK use only. */
  public setUserSessionManager(
    userSessionManager: UserSessionManagerInternal,
  ): void {
    this._userSessionManager = userSessionManager;
  }

  /** @internal SDK use only. */
  public getUserSessionManager(): UserSessionManagerInternal {
    return this._userSessionManager;
  }

  getUserSessionId(): string | null {
    return this._userSessionManager.getUserSessionId();
  }
  getPreviousUserSessionId(): string | null {
    return this._userSessionManager.getPreviousUserSessionId();
  }
  getUserSessionStartTime(): number | null {
    return this._userSessionManager.getUserSessionStartTime();
  }

  endUserSession(): void {
    this._userSessionManager.endUserSession();
  }
  setSessionId(id: string | null): void {
    this._userSessionManager.setSessionId(id);
  }
  addUserSessionStartedListener(listener: () => void): () => void {
    return this._userSessionManager.addUserSessionStartedListener(listener);
  }
  addUserSessionEndedListener(listener: () => void): () => void {
    return this._userSessionManager.addUserSessionEndedListener(listener);
  }

  addBreadcrumb(name: string): void {
    this._userSessionManager.addBreadcrumb(name);
  }
  addProperty(key: string, value: string, options?: PropertyOptions): void {
    this._userSessionManager.addProperty(key, value, options);
  }
  removeProperty(key: string): void {
    this._userSessionManager.removeProperty(key);
  }

  getSessionId(): string | null {
    return this.getUserSessionId();
  }
  getPreviousSessionId(): string | null {
    return this.getPreviousUserSessionId();
  }
  getSessionStartTime(): HrTime | null {
    const ms = this.getUserSessionStartTime();
    if (ms === null) {
      return null;
    }
    const seconds = Math.floor(ms / 1000);
    const nanoseconds = (ms % 1000) * 1_000_000;
    return [seconds, nanoseconds];
  }
  endSessionSpan(): void {
    this.endUserSession();
  }
  getSessionSpan() {
    return null;
  }
  addSessionStartedListener(listener: () => void): () => void {
    return this.addUserSessionStartedListener(listener);
  }
  addSessionEndedListener(listener: () => void): () => void {
    return this.addUserSessionEndedListener(listener);
  }
}
