import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/types.ts';

export type ElementTimingInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'perf' | 'limitManager'
>;

export type PerformanceElementTiming = PerformanceEntry & {
  identifier: string;
  element: Element | null;
  renderTime: number;
  loadTime: number;
  url: string;
  naturalWidth: number;
  naturalHeight: number;
};
