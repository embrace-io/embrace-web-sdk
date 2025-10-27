import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export type EmptyRootInstrumentationArgs = {
  rootNode: Node;
  emptyCheckDelayMs?: number;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
