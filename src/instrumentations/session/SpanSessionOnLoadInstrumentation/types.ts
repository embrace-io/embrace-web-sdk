import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type SpanSessionOnLoadInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
>;
