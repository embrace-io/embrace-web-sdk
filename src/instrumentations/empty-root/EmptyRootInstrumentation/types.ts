import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export type EmptyRootInstrumentationArgs = {
  rootNode: Node;
  emptyCheckDelay?: number;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
