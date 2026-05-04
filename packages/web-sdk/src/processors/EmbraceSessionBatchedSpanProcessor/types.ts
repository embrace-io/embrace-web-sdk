import type { DiagLogger } from '@opentelemetry/api';
import type { SpanExporter } from '@opentelemetry/sdk-trace-web';
import type {
  LimitManagerInternal,
  UserSessionManagerInternal,
} from '../../managers/index.ts';

export type EmbraceSessionBatchedSpanProcessorArgs = {
  exporter: SpanExporter;
  limitManager: LimitManagerInternal;
  userSessionManager: UserSessionManagerInternal;
  diag?: DiagLogger;
};
