import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';
import type { VisibilityStateDocument } from '../../../common/index.js';

export type SpanSessionVisibilityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
> & {
  backgroundSessions?: boolean;
  visibilityDoc?: VisibilityStateDocument;
};
