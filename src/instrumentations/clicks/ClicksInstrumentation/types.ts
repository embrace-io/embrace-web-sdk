import type { EmbraceInstrumentationBaseArgs } from '../../session/index.js';

export type ClicksInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf'
>;
