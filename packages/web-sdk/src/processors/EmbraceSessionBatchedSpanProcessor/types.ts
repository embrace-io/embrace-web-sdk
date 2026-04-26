import type { DiagLogger } from '@opentelemetry/api';
import type { Resource } from '@opentelemetry/resources';
import type { SpanExporter } from '@opentelemetry/sdk-trace-web';
import type {
  LimitManagerInternal,
  SpanSessionManagerInternal,
} from '../../managers/index.ts';

export type EmbraceSessionBatchedSpanProcessorArgs = {
  resource: Resource;
  exporter: SpanExporter;
  limitManager: LimitManagerInternal;
  spanSessionManager: SpanSessionManagerInternal;
  diag?: DiagLogger;
};
