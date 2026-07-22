import type { NavigationHost } from '../../../common/index.ts';
import type { SignalBuffer } from '../../../processors/utils/SignalBuffer.ts';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/types.ts';

export type SoftNavigationPerformanceInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf' | 'limitManager'
> & {
  navigationHost?: NavigationHost;
  signalBuffer?: SignalBuffer;
};

export type PerformanceSoftNavigationTiming = PerformanceEntry & {
  navigationId: number;
  interactionId?: number;
  paintTime?: number | null;
  presentationTime?: number | null;
};
