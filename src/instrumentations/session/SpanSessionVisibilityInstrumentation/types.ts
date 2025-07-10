import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';
import type { VisibilityStateDocument } from '../../../common/index.js';

export type SpanSessionVisibilityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
> & {
  visibilityWaitTimeMs?: number; // visibilityWaitTimeMs indicates how much time to wait before checking if the visibilityDoc visibility changed or not
  backgroundSessions?: boolean;
  visibilityDoc?: VisibilityStateDocument;
};
