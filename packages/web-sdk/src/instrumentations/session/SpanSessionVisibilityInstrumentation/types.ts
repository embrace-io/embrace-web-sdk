import type { VisibilityStateDocument } from '../../../common/index.ts';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type SpanSessionVisibilityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf'
> & {
  visibilityWaitTimeMs?: number; // visibilityWaitTimeMs indicates how much time to wait before checking if the visibilityDoc visibility changed or not
  limitedSessionMaxDurationMs?: number; // limitedSessionMaxDurationMs indicates the maximum duration a session can have while still considering it limited
  backgroundSessions?: boolean;
  storedSpansExpireTimeoutMS?: number; // storedSpansExpireTimeoutMS indicates the max time a span should live in storage before exporting.
  maxPendingSpanCount?: number; // maxPendingSpanCount indicates the maximum number of pending spans to have to consider saving the current session to storage
  visibilityDoc?: VisibilityStateDocument;
};
