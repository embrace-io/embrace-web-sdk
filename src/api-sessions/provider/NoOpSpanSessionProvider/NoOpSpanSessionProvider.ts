import { SpanSessionProvider } from '../types.js';
import { Span } from '@opentelemetry/api';

export class NoOpSpanSessionProvider implements SpanSessionProvider {
  getSessionId(): string | null {
    return null;
  }

  getSessionSpan(): Span | null {
    return null;
  }

  startSessionSpan(): void {}

  endSessionSpan(): void {}
}
