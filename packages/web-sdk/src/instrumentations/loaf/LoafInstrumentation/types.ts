// TypeScript's DOM lib does not yet include Long Animation Frames API types (as of TS 5.9)
// so we use the global augmentation from 'web-vitals' instead.
// Spec: https://w3c.github.io/long-animation-frames/
// MDN: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming
// This is not a typo:
import type {} from 'web-vitals';

import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type LoafInstrumentationArgs = {
  maxScriptEntries?: number;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
