import type {
  Metric,
  MetricWithAttribution,
  ReportOpts,
} from 'web-vitals/attribution';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.js';

export type TrackingLevel = 'core' | 'all';

export type WebVitalOnReport = (metric: MetricWithAttribution) => void;

export type WebVitalListeners = Record<
  Metric['name'],
  ((onReport: WebVitalOnReport, opts?: ReportOpts) => void) | undefined
>;

export type WebVitalsInstrumentationArgs = {
  trackingLevel?: TrackingLevel;
  listeners?: WebVitalListeners;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
