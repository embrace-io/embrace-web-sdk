import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export type SpanSessionBrowserActivityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
>;
