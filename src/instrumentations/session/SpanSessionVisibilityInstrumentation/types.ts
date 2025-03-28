import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/types.js';

export type SpanSessionVisibilityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
>;
