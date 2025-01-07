import {Span} from '@opentelemetry/api';

interface SpanSessionProvider {
  getSessionId(): string | null;

  getSessionSpan(): Span | null;

  startSessionSpan(): void;

  endSessionSpan(): void;
}

export type {SpanSessionProvider};
