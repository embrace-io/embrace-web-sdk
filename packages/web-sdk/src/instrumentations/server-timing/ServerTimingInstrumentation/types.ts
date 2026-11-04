import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/types.ts';

export type ServerTimingInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'perf' | 'limitManager'
>;
