type SessionPartInfo = {
  endReason?: string;
};

type ReceivedSpans = Record<string, Record<string, SessionPartInfo>>;

// OTLP/JSON (https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding): hex IDs, base64 bytes, integer enums,
// 64-bit integers as strings or numbers; encoders may omit any field that holds its default value.
type Fixed64 = string | number;

type IAnyValue = {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: Fixed64;
  doubleValue?: number;
  arrayValue?: IArrayValue;
  kvlistValue?: IKeyValueList;
  bytesValue?: string;
};

type IArrayValue = {
  values: IAnyValue[];
};

type IKeyValueList = {
  values: IKeyValue[];
};

type IKeyValue = {
  key: string;
  value: IAnyValue;
};

type IResource = {
  attributes: IKeyValue[];
  droppedAttributesCount: number;
};

type IInstrumentationScope = {
  name: string;
  version?: string;
  attributes?: IKeyValue[];
  droppedAttributesCount?: number;
};

type IEvent = {
  timeUnixNano: Fixed64;
  name: string;
  attributes: IKeyValue[];
  droppedAttributesCount: number;
};

type ILink = {
  traceId: string;
  spanId: string;
  traceState?: string;
  attributes: IKeyValue[];
  droppedAttributesCount: number;
  flags?: number;
};

type IStatus = {
  message?: string;
  code: number;
};

type ISpan = {
  traceId: string;
  spanId: string;
  traceState?: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: Fixed64;
  endTimeUnixNano: Fixed64;
  attributes: IKeyValue[];
  droppedAttributesCount: number;
  events: IEvent[];
  droppedEventsCount: number;
  links: ILink[];
  droppedLinksCount: number;
  status: IStatus;
  flags?: number;
};

type IScopeSpans = {
  scope?: IInstrumentationScope;
  spans?: ISpan[];
  schemaUrl?: string;
};

type IResourceSpans = {
  resource?: IResource;
  scopeSpans: IScopeSpans[];
  schemaUrl?: string;
};

type IExportTraceServiceRequest = {
  resourceSpans?: IResourceSpans[];
};

type ILogRecord = {
  timeUnixNano: Fixed64;
  observedTimeUnixNano: Fixed64;
  severityNumber?: number;
  severityText?: string;
  body?: IAnyValue;
  attributes: IKeyValue[];
  droppedAttributesCount: number;
  flags?: number;
  traceId?: string;
  spanId?: string;
  eventName?: string;
};

type IScopeLogs = {
  scope?: IInstrumentationScope;
  logRecords?: ILogRecord[];
  schemaUrl?: string;
};

type IResourceLogs = {
  resource?: IResource;
  scopeLogs: IScopeLogs[];
  schemaUrl?: string;
};

type IExportLogsServiceRequest = {
  resourceLogs?: IResourceLogs[];
};

// Only the fields every data point kind shares; the collector does not read the rest.
type IDataPoint = {
  attributes?: IKeyValue[];
  startTimeUnixNano?: Fixed64;
  timeUnixNano?: Fixed64;
};

type IMetricData = {
  dataPoints: IDataPoint[];
};

type IMetric = {
  name: string;
  description?: string;
  unit?: string;
  gauge?: IMetricData;
  sum?: IMetricData;
  histogram?: IMetricData;
  exponentialHistogram?: IMetricData;
  summary?: IMetricData;
};

type IScopeMetrics = {
  scope?: IInstrumentationScope;
  metrics: IMetric[];
  schemaUrl?: string;
};

type IResourceMetrics = {
  resource?: IResource;
  scopeMetrics: IScopeMetrics[];
  schemaUrl?: string;
};

type IExportMetricsServiceRequest = {
  resourceMetrics?: IResourceMetrics[];
};

export type {
  IAnyValue,
  IEvent,
  IExportLogsServiceRequest,
  IExportMetricsServiceRequest,
  IExportTraceServiceRequest,
  IKeyValue,
  ILogRecord,
  IResource,
  IResourceLogs,
  IResourceMetrics,
  IResourceSpans,
  IScopeLogs,
  IScopeSpans,
  ISpan,
  ReceivedSpans,
  SessionPartInfo,
};
