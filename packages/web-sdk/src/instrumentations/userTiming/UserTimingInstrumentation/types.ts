import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/types.ts';

export type UserTimingInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf' | 'limitManager'
>;
