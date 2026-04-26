import type { DiagLogger } from '@opentelemetry/api';
import type { SpanExporter } from '@opentelemetry/sdk-trace-web';
import type { SessionPartManager } from '../../api-sessions/index.ts';
import type { LimitManagerInternal } from '../../managers/index.ts';

export type EmbraceSessionBatchedSpanProcessorArgs = {
  exporter: SpanExporter;
  limitManager: LimitManagerInternal;
  sessionPartManager: SessionPartManager;
  diag?: DiagLogger;
};
