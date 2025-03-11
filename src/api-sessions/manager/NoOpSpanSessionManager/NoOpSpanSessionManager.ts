import { SpanSessionManager } from '../types.js';
import { HrTime, Span } from '@opentelemetry/api';

export class NoOpSpanSessionManager implements SpanSessionManager {
  public getSessionId = () => null;

  public getSessionSpan(): Span | null {
    return null;
  }

  public getSessionStartTime(): HrTime | null {
    return null;
  }

  public startSessionSpan(): void {
    // do nothing.
  }

  public endSessionSpan(): void {
    // do nothing.
  }

  public endSessionSpanInternal(): void {
    // do nothing.
  }
}
