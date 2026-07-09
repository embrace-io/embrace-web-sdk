import type { NavigationHost } from '../../../common/index.ts';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/types.ts';

export type SoftNavigationPerformanceInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf' | 'limitManager'
> & {
  navigationHost?: NavigationHost;
};

export type PerformanceSoftNavigationTiming = PerformanceEntry & {
  navigationId: number;
  interactionId?: number;
  paintTime?: number | null;
  presentationTime?: number | null;
};
