import type { VisibilityStateDocument } from '../../../common/index.ts';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type SpanSessionBrowserActivityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf'
> & {
  target?: EventTarget;
  visibilityDoc?: VisibilityStateDocument;
  partInactivityTimeoutMs?: number;
  throttleMs?: number;
  events?: ReadonlyArray<string>;
};
