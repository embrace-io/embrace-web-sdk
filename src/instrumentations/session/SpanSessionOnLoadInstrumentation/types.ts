import type { EmbraceInstrumentationBaseArgs } from '../EmbraceInstrumentationBase/types.js';

export type SpanSessionOnLoadInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
>;
