import type { AttributeValue, DiagLogger } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import type { LogSeverity } from '../../api-logs/index.js';

export interface EmbraceLimitManagerArgs {
  diag?: DiagLogger;
  maxLogsBySeverity: Record<LogSeverity, number>;
  maxLogLength: number;
  maxNetworkRequests: number;
  maxSpans: number;
  maxSpanAttributes: number;
  maxSpanEvents: number;
  maxAttributesPerSpanEvent: number;
  maxBreadcrumbs: number;
  maxBreadcrumbLength: number;
  maxSessionProperties: number;
}

export interface LimitManagerInternal {
  allowSpan: (span: ReadableSpan) => boolean;
  allowLog: (
    message: string,
    severity: LogSeverity,
    attributes: Record<string, AttributeValue | undefined>
  ) => boolean;
  allowSessionProperty: (key: string, value: string) => boolean;
  allowBreadcrumb: (name: string) => boolean;
  reset: () => void;
}
