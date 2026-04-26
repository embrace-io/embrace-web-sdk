import type { VisibilityStateDocument } from '../../../common/index.ts';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type SpanSessionVisibilityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf'
> & {
  visibilityWaitTimeMs?: number; // visibilityWaitTimeMs indicates how much time to wait before checking if the visibilityDoc visibility changed or not
  backgroundSessions?: boolean;
  visibilityDoc?: VisibilityStateDocument;
};
