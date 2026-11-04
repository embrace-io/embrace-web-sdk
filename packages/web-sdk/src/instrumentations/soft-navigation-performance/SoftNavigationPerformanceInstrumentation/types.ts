import type { NavigationHost } from '../../../common/index.ts';
import type { SignalBuffer } from '../../../processors/utils/SignalBuffer.ts';

export type SoftNavigationPerformanceInstrumentationArgs = {
  navigationHost?: NavigationHost;
  signalBuffer?: SignalBuffer;
};

export type PerformanceSoftNavigationTiming = PerformanceEntry & {
  navigationId: number;
  interactionId?: number;
  paintTime?: number | null;
  presentationTime?: number | null;
};
