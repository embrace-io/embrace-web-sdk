import type { EmbraceInstrumentationBaseArgs } from '../EmbraceInstrumentationBase/types.js';

export type SpanSessionBrowserActivityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag'
>;
