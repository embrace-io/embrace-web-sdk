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

export type WebVitalOnReport = (metric: MetricWithAttribution) => void;

export type WebVitalListeners = Record<
  Metric['name'],
  ((onReport: WebVitalOnReport, opts?: ReportOpts) => void) | undefined
>;

export interface WebVitalsInstrumentationConfig extends InstrumentationConfig {
  // OTel upstream options
  applyCustomLogRecordData?: (logRecord: LogRecord) => void;

  // Embrace-specific (testability + SPA page attribution)
  listeners?: WebVitalListeners;
  urlDocument?: URLDocument;
  urlAttribution?: boolean;
  pageManager?: PageManager;
  diag?: DiagLogger;
  perf?: PerformanceManager;
}

// Backward-compat alias
export type WebVitalsInstrumentationArgs = WebVitalsInstrumentationConfig;
