import type { DiagLogger } from '@opentelemetry/api';
import type { SpanExporter } from '@opentelemetry/sdk-trace-web';
import type { LimitManagerInternal } from '../../managers/EmbraceLimitManager/types.ts';
import type { UserSessionManagerInternal } from '../../managers/EmbraceUserSessionManager/types.ts';

export type EmbraceSessionPartBatchedSpanProcessorArgs = {
  exporter: SpanExporter;
  limitManager: LimitManagerInternal;
  userSessionManager: UserSessionManagerInternal;
  diag?: DiagLogger;
};
