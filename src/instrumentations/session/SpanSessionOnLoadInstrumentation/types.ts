import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export type SpanSessionOnLoadInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
>;
