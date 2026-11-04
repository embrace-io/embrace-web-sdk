import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type DOMStateInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'perf'
>;
