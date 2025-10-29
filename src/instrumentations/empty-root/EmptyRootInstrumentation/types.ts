import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export type EmptyRootInstrumentationArgs = {
  rootNode: Node | null;
  emptyCheckDelayMs?: number;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
