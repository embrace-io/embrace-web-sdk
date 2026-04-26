import type { HrTime } from '@opentelemetry/api';
import type { UserSessionLifecycleManager } from '../../../managers/EmbraceUserSessionManager/types.ts';
import { ProxySessionPartManager } from '../ProxySessionPartManager/index.ts';
import type {
  PropertyOptions,
  SessionPartManager,
  UserSessionManager,
} from '../types.ts';

// Stand-in used before setDelegates installs the real lifecycle manager.
// The non-null accessors return null so callers can detect the pre-init state;
// onSessionPartStart must return a UserSessionAttributes shape to satisfy
// the type, but in production nothing reaches it: EmbraceSessionPartManager
// is wired directly to the concrete EmbraceUserSessionManager, never to this
// proxy's lifecycle delegate.
const NOOP_LIFECYCLE_MANAGER: UserSessionLifecycleManager = {
  getUserSessionId: () => null,
  getPreviousUserSessionId: () => null,
  getUserSessionStartTime: () => null,
  getUserSessionAttributes: () => null,
  getSessionIds: () => ({
    sessionId: '',
    sessionPreviousId: '',
    userSessionId: '',
    userSessionPreviousId: '',
    sessionIdOverride: null,
  }),
  onSessionPartStart: () => ({
    'session.id': '',
    'emb.user_session_id': '',
    'emb.user_session_number': 0,
    'emb.user_session_part_number': 0,
    'emb.user_session_start_ts': 0,
    'emb.user_session_max_duration_seconds': 0,
    'emb.user_session_inactivity_timeout_seconds': 0,
  }),
  onSessionPartEnd: () => {},
  setSessionPartCallbacks: () => {},
  getTerminationInfo: () => ({ isFinal: false, reason: null }),
  endUserSession: () => {},
  setSessionId: () => {},
  addUserSessionStartedListener: () => () => {},
  addUserSessionEndedListener: () => () => {},
};

export class ProxyUserSessionManager implements UserSessionManager {
  private readonly _partDelegate: ProxySessionPartManager =
    new ProxySessionPartManager();
  private _lifecycleDelegate: UserSessionLifecycleManager =
    NOOP_LIFECYCLE_MANAGER;

  public setDelegates(
    partManager: SessionPartManager,
    lifecycleManager?: UserSessionLifecycleManager,
  ): void {
    this._partDelegate.setDelegate(partManager);
    if (lifecycleManager) {
      this._lifecycleDelegate = lifecycleManager;
    }
  }

  public getPartDelegate(): SessionPartManager {
    return this._partDelegate;
  }

  public getLifecycleDelegate(): UserSessionLifecycleManager {
    return this._lifecycleDelegate;
  }

  // -- User session identity (delegate to lifecycle manager) --
  getUserSessionId(): string | null {
    return this._lifecycleDelegate.getUserSessionId();
  }
  getPreviousUserSessionId(): string | null {
    return this._lifecycleDelegate.getPreviousUserSessionId();
  }
  getUserSessionStartTime(): number | null {
    return this._lifecycleDelegate.getUserSessionStartTime();
  }

  // -- Session part identity (read-only, delegate to part manager) --
  getSessionPartId(): string | null {
    return this._partDelegate.getSessionPartId();
  }
  getPreviousSessionPartId(): string | null {
    return this._partDelegate.getPreviousSessionPartId();
  }

  // -- User session lifecycle (delegate to lifecycle manager) --
  endUserSession(): void {
    this._lifecycleDelegate.endUserSession();
  }
  setSessionId(id: string | null): void {
    this._lifecycleDelegate.setSessionId(id);
  }
  addUserSessionStartedListener(listener: () => void): () => void {
    return this._lifecycleDelegate.addUserSessionStartedListener(listener);
  }
  addUserSessionEndedListener(listener: () => void): () => void {
    return this._lifecycleDelegate.addUserSessionEndedListener(listener);
  }

  // -- User session properties (delegate to part manager internally) --
  addBreadcrumb(name: string): void {
    this._partDelegate.addBreadcrumb(name);
  }
  addUserSessionProperty(
    key: string,
    value: string,
    options?: PropertyOptions,
  ): void {
    this._partDelegate.addProperty(key, value, options);
  }
  addPermanentUserSessionProperty(key: string, value: string): void {
    this._partDelegate.addProperty(key, value, { lifespan: 'permanent' });
  }
  removeUserSessionProperty(key: string): void {
    this._partDelegate.removeProperty(key);
  }

  // -- Deprecated methods --
  addProperty(key: string, value: string, options?: PropertyOptions): void {
    this.addUserSessionProperty(key, value, options);
  }
  removeProperty(key: string): void {
    this.removeUserSessionProperty(key);
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
    return this._partDelegate.getSessionPartSpan();
  }
  addSessionStartedListener(listener: () => void): () => void {
    return this.addUserSessionStartedListener(listener);
  }
  addSessionEndedListener(listener: () => void): () => void {
    return this.addUserSessionEndedListener(listener);
  }
}
