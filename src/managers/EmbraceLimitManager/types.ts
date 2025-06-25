import type { AttributeValue, DiagLogger } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import type { LogSeverity } from '../../api-logs/index.js';

export interface EmbraceLimitManagerArgs {
  diag?: DiagLogger;
  maxAllowed: Record<MaxLimitedType, number>;
  maxLength: Record<LengthLimitedType, number>;
  maxAttributes: Record<AttributeLimitedType, number>;
}

export type LogLimitedType = 'error_log' | 'warning_log' | 'info_log';

export type MaxLimitedType =
  | LogLimitedType
  | 'span'
  | 'network_request'
  | 'breadcrumb'
  | 'session_property';

export type LengthLimitedType =
  | LogLimitedType
  | 'breadcrumb'
  | 'session_property';

export type AttributeLimitedType = LogLimitedType;

export type LimitedType =
  | MaxLimitedType
  | LengthLimitedType
  | AttributeLimitedType;

export type LimitOperation = 'drop' | 'truncate_string' | 'truncate_attributes';

export type LimitedBreadcrumb = {
  name: string;
};

export type LimitedLog = {
  message: string;
  attributes: Record<string, AttributeValue | undefined>;
};

export type LimitedSessionProperty = {
  key: string;
  value: string;
};

export interface LimitManagerInternal {
  dropReadableSpan: (span: ReadableSpan) => boolean;
  limitLog: (
    message: string,
    severity: LogSeverity,
    attributes: Record<string, AttributeValue | undefined>
  ) => LimitedLog | 'dropped';
  limitSessionProperty: (
    key: string,
    value: string
  ) => LimitedSessionProperty | 'dropped';
  limitBreadcrumb: (name: string) => LimitedBreadcrumb | 'dropped';
  reset: () => void;
  getDiagnosticCounts: () => Record<string, number>;
}
