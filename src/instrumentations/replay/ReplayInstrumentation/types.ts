import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export type ReplayInstrumentationArgs = {
  /**
   * Whether to compress replay events using rrweb's pack function.
   * Compression reduces payload size but uses more CPU.
   * @default true
   */
  compress?: boolean;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
