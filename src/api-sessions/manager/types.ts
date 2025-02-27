import { HrTime, Span } from '@opentelemetry/api';

export interface SpanSessionManager {
  getSessionId(): string | null;

  getSessionStartTime(): HrTime | null;

  getSessionSpan(): Span | null;

  startSessionSpan(): void;

  endSessionSpan(): void;

  // todo move this to another class SpanSessionManagerInternal that is only accessible from within our code, but expose the external one without the method to the users.
  endSessionSpanInternal(reason: ReasonSessionEnded): void;
}

export type ReasonSessionEnded =
  | 'unknown'
  | 'inactivity'
  | 'max_time_reached'
  | 'user_ended'
  | 'max_size_reached'
  | 'visibility_hidden'
  | 'new_session_started';
