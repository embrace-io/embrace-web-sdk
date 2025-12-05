import type {
  Metric,
  MetricWithAttribution,
  ReportOpts,
} from 'web-vitals/attribution';
import type { PageManager } from '../../../api-page/index.ts';
import type { URLDocument } from '../../../common/index.ts';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';

export type TrackingLevel = 'core' | 'all';

export type WebVitalOnReport = (metric: MetricWithAttribution) => void;

export type WebVitalListeners = Record<
  Metric['name'],
  ((onReport: WebVitalOnReport, opts?: ReportOpts) => void) | undefined
>;

export type WebVitalsInstrumentationArgs = {
  trackingLevel?: TrackingLevel;
  listeners?: WebVitalListeners;
  urlDocument?: URLDocument;
  urlAttribution?: boolean;
  pageManager?: PageManager;
} & Pick<EmbraceInstrumentationBaseArgs, 'diag' | 'perf'>;
