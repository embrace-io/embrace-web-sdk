import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type EmptyRootInstrumentationArgs = {
  rootNode: Node | null;
  emptyCheckDelayMs?: number;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
