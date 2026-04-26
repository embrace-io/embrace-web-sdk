import type { HrTime } from '@opentelemetry/api';
import type { ExtendedSpan } from '../../../index.ts';
import type {
  PropertyOptions,
  SessionPartEndReason,
  SessionPartManager,
  SessionPartStartReason,
} from '../index.ts';

export class NoOpSessionPartManager implements SessionPartManager {
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

  public endSessionPart(): void {
    // do nothing.
  }

  public endSessionPartInternal(_reason: SessionPartEndReason): void {
    // do nothing.
  }

  public getSessionPartId = () => null;

  public getPreviousSessionPartId = () => null;

  public getSessionPartSpan(): ExtendedSpan | null {
    return null;
  }

  public getSessionPartStartTime(): HrTime | null {
    return null;
  }

  public startSessionPart(_reason?: SessionPartStartReason): void {
    // do nothing.
  }

  public addSessionPartStartedListener(_listener: () => void): () => void {
    return () => {};
  }

  public addSessionPartEndedListener(_listener: () => void): () => void {
    return () => {};
  }

  public incrSessionPartCountForKey(_key: string): void {
    // do nothing.
  }

  public incrNextSessionPartCountForKey(_key: string): void {
    // do nothing.
  }
}
