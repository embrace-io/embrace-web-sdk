import type { DiagLogger } from '@opentelemetry/api';
import type { LogRecord } from '@opentelemetry/api-logs';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type {
  Metric,
  MetricWithAttribution,
  ReportOpts,
} from 'web-vitals/attribution';
import type { PageManager } from '../../../api-page/index.ts';
import type { URLDocument } from '../../../common/index.ts';
import type { PerformanceManager } from '../../../utils/index.ts';

/** @deprecated All vitals metrics are tracked */
export type TrackingLevel = 'core' | 'all';

export type WebVitalOnReport = (metric: MetricWithAttribution) => void;

export type WebVitalListeners = Record<
  Metric['name'],
  ((onReport: WebVitalOnReport, opts?: ReportOpts) => void) | undefined
>;

export interface WebVitalsInstrumentationConfig extends InstrumentationConfig {
  // OTel upstream options
  /**
   * @experimental
   * When true, sets the log record body to the JSON-stringified
   * `web-vitals` attribution object for the metric.
   *
   * Note: `applyCustomLogRecordData` runs after the body is set.
   * If the hook assigns a new `body`, it will overwrite the attribution data.
   */
  includeRawAttribution?: boolean;
  applyCustomLogRecordData?: (logRecord: LogRecord) => void;

  // Embrace-specific (testability + SPA page attribution)
  listeners?: WebVitalListeners;
  urlDocument?: URLDocument;
  urlAttribution?: boolean;
  pageManager?: PageManager;
  diag?: DiagLogger;
  perf?: PerformanceManager;

  /** @deprecated All vitals metrics are tracked */
  trackingLevel?: TrackingLevel;
}
