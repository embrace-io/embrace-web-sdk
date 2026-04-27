import type { VisibilityStateDocument } from '../../../common/index.ts';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type SpanSessionVisibilityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf'
> & {
  backgroundSessions?: boolean;
  visibilityDoc?: VisibilityStateDocument;
};
