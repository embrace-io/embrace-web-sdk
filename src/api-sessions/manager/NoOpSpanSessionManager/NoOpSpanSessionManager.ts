import type { HrTime } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import type { ExtendedSpan } from '../../../index.js';
import type {
  PropertyOptions,
  ReasonSessionEnded,
  SpanSessionManager,
} from '../index.js';

export class NoOpSpanSessionManager implements SpanSessionManager {
  public addBreadcrumb(_name: string): void {
    // do nothing.
  }

  public addProperty(
    _key: string,
    _value: string,
    _options?: PropertyOptions
  ): void {
    // do nothing.
  }

  public removeProperty(_key: string): void {
    // do nothing.
  }

  public endSessionSpan(): void {
    // do nothing.
  }

  public endSessionSpanInternal(_reason: ReasonSessionEnded): void {
    // do nothing.
  }

  public currentSessionAsReadableSpan(
    _reason: ReasonSessionEnded
  ): ReadableSpan | null {
    return null;
  }

  public getSessionId = () => null;

  public getPreviousSessionId = () => null;

  public getSessionSpan(): ExtendedSpan | null {
    return null;
  }

  public getSessionStartTime(): HrTime | null {
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
}
