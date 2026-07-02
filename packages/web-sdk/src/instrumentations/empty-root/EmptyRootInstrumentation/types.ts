import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/types.ts';

export type EmptyRootInstrumentationArgs = {
  rootNode: Node | null;
  emptyCheckDelayMs?: number;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
