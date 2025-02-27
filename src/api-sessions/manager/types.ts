import { HrTime, Span } from '@opentelemetry/api';

export interface SpanSessionManager {
  getSessionId(): string | null;

  getSessionStartTime(): HrTime | null;

  getSessionSpan(): Span | null;

  startSessionSpan(): void;

  endSessionSpan(): void;
}
