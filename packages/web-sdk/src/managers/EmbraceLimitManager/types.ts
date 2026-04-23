import type { AttributeValue, DiagLogger } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import type { LogSeverity } from '../../api-logs/index.ts';

export interface EmbraceLimitManagerArgs {
  diag?: DiagLogger;
  maxAllowed: Record<MaxLimitedType, number>;
  maxLength: Record<LengthLimitedType, number>;
  maxAttributes: Record<AttributeLimitedType, number>;
}

export type LogLimitedType = 'error_log' | 'warning_log' | 'info_log';

export type MaxLimitedType =
  | LogLimitedType
  | 'exception'
  | 'span'
  | 'network_request'
  | 'breadcrumb'
  | 'session_property'
  | 'user_timing_mark'
  | 'user_timing_measure'
  | 'element_timing'
  | 'server_timing';

export type LengthLimitedType =
  | LogLimitedType
  | 'exception'
  | 'breadcrumb'
  | 'session_property_key'
  | 'session_property_value'
  | 'log_attribute_key'
  | 'log_attribute_value'
  | 'exception_attribute_key'
  | 'exception_attribute_value';

export type AttributeLimitedType = LogLimitedType | 'exception';

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

export type LimitedException = {
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
    attributes: Record<string, AttributeValue | undefined>,
  ) => LimitedLog | 'dropped';
  limitException: (
    message: string,
    attributes: Record<string, AttributeValue | undefined>,
  ) => LimitedException | 'dropped';
  limitSessionProperty: (
    key: string,
    value: string,
  ) => LimitedSessionProperty | 'dropped';
  limitBreadcrumb: (name: string) => LimitedBreadcrumb | 'dropped';
  limitUserTimingEntry: (entryType: 'mark' | 'measure') => boolean;
  limitElementTimingEntry: () => boolean;
  limitServerTimingEntry: () => boolean;
  reset: () => void;
  getDiagnosticCounts: () => Record<string, number>;
  truncateString: (type: LengthLimitedType, body: string) => string;
}
