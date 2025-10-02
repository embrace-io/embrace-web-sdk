import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';
import type { BodyDocument } from '../../../common/index.js';

export type EmptyRootInstrumentationArgs = {
  rootNode?: Node;
  bodyDoc?: BodyDocument;
  emptyCheckDelay?: number;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
