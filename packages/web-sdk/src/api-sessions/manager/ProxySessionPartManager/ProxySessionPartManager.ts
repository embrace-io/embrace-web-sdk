import type { HrTime } from '@opentelemetry/api';
import type {
  PropertyOptions,
  SessionPartEndReason,
  SessionPartManager,
  SessionPartStartReason,
} from '../index.ts';
import { NoOpSessionPartManager } from '../NoOpSessionPartManager/index.ts';

const NOOP_SESSION_PART_MANAGER = new NoOpSessionPartManager();

export class ProxySessionPartManager implements SessionPartManager {
  private _delegate?: SessionPartManager;

  public getDelegate(): SessionPartManager {
    return this._delegate ?? NOOP_SESSION_PART_MANAGER;
  }

  public setDelegate(delegate: SessionPartManager): void {
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

  public endSessionPart() {
    this.getDelegate().endSessionPart();
  }

  public endSessionPartInternal(reason: SessionPartEndReason) {
    this.getDelegate().endSessionPartInternal(reason);
  }

  public getSessionPartId(): string | null {
    return this.getDelegate().getSessionPartId();
  }

  public getPreviousSessionPartId(): string | null {
    return this.getDelegate().getPreviousSessionPartId();
  }

  public getSessionPartSpan() {
    return this.getDelegate().getSessionPartSpan();
  }

  public getSessionPartStartTime(): HrTime | null {
    return this.getDelegate().getSessionPartStartTime();
  }

  public startSessionPart(reason?: SessionPartStartReason) {
    this.getDelegate().startSessionPart(reason);
  }

  public addSessionPartStartedListener(listener: () => void): () => void {
    return this.getDelegate().addSessionPartStartedListener(listener);
  }

  public addSessionPartEndedListener(listener: () => void): () => void {
    return this.getDelegate().addSessionPartEndedListener(listener);
  }

  public incrSessionPartCountForKey(key: string): void {
    this.getDelegate().incrSessionPartCountForKey(key);
  }

  public incrNextSessionPartCountForKey(key: string): void {
    this.getDelegate().incrNextSessionPartCountForKey(key);
  }
}
