import type { SpanExporter } from '@opentelemetry/sdk-trace-web';
import type {
  LimitManagerInternal,
  SpanSessionManagerInternal,
} from '../../managers/index.js';
import type { Resource } from '@opentelemetry/resources';
import type { DiagLogger } from '@opentelemetry/api';

export type EmbraceSessionBatchedSpanProcessorArgs = {
  resource: Resource;
  exporter: SpanExporter;
  limitManager: LimitManagerInternal;
  spanSessionManager: SpanSessionManagerInternal;
  storage?: Storage;
  storedSpansExpireTimeoutMS?: number;
  diag?: DiagLogger;
};
