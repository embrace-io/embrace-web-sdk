import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/types.ts';

export type SoftNavigationPerformanceInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf' | 'limitManager'
>;

export type PerformanceSoftNavigationTiming = PerformanceEntry & {
  navigationId: string;
  interactionId?: number;
  paintTime?: number | null;
  presentationTime?: number | null;
};
