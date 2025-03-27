import type { EmbraceInstrumentationBaseArgs } from '../../session/EmbraceInstrumentationBase/types.js';
import type {
  Metric,
  MetricWithAttribution,
  ReportOpts
} from 'web-vitals/attribution';

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
