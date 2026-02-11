import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type SpanSessionBrowserActivityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
>;
