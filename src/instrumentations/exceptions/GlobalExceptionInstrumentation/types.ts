import type { EmbraceInstrumentationBaseArgs } from '../../session/index.js';

export type GlobalExceptionInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'perf'
>;
