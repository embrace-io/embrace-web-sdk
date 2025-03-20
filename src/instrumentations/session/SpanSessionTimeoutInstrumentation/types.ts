import type { EmbraceInstrumentationBaseArgs } from '../EmbraceInstrumentationBase/types.js';

export type SpanSessionTimeoutInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf'
>;
