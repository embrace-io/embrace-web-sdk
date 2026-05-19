import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type RageClickInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf'
>;
