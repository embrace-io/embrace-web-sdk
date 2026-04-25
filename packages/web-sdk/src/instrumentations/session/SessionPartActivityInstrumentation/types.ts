import type { VisibilityStateDocument } from '../../../common/index.ts';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type SessionPartActivityInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf'
> & {
  /** Override for tests. */
  target?: EventTarget;
  /** Override for tests. */
  visibilityDoc?: VisibilityStateDocument;
  /** Override for tests. */
  partInactivityTimeoutMs?: number;
  /** Override for tests. */
  throttleMs?: number;
  /** Override for tests. */
  events?: ReadonlyArray<string>;
};
