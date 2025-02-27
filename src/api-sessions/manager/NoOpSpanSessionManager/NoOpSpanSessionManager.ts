import { SpanSessionManager } from '../types.js';
import { HrTime, Span } from '@opentelemetry/api';

export class NoOpSpanSessionManager implements SpanSessionManager {
  getSessionId(): string | null {
    return null;
  }

  getSessionSpan(): Span | null {
    return null;
  }

  getSessionStartTime(): HrTime | null {
    return null;
  }

  startSessionSpan(): void {}

  endSessionSpan(): void {}
}
