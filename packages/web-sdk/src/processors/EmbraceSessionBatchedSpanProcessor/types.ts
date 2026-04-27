import type { DiagLogger } from '@opentelemetry/api';
import type { SpanExporter } from '@opentelemetry/sdk-trace-web';
import type {
  LimitManagerInternal,
  SpanSessionManagerInternal,
} from '../../managers/index.ts';

export type EmbraceSessionBatchedSpanProcessorArgs = {
  exporter: SpanExporter;
  limitManager: LimitManagerInternal;
  spanSessionManager: SpanSessionManagerInternal;
  diag?: DiagLogger;
};
