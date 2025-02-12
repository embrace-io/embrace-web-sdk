import { Span } from '@opentelemetry/api';

export interface SpanSessionManager {
  getSessionId(): string | null;

  getSessionSpan(): Span | null;

  startSessionSpan(): void;

  endSessionSpan(): void;
}
