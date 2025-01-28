import { Span } from '@opentelemetry/api';

export interface SpanSessionProvider {
  getSessionId(): string | null;

  getSessionSpan(): Span | null;

  startSessionSpan(): void;

  endSessionSpan(): void;
}
