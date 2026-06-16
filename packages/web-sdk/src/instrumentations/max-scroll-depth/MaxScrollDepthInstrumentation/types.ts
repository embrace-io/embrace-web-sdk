import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type MaxScrollDepthInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf'
>;
