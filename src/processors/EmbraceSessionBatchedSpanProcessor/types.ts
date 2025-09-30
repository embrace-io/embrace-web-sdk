import type { SpanExporter } from '@opentelemetry/sdk-trace-web';
import type { EmbraceProcessorArgs } from '../EmbraceProcessor/index.js';
import type { LimitManagerInternal } from '../../managers/index.js';
import type { Resource } from '@opentelemetry/resources';

export type EmbraceSessionBatchedSpanProcessorArgs = {
  resource: Resource;
  exporter: SpanExporter;
  limitManager: LimitManagerInternal;
  storage?: Storage;
  storedSpansExpireTimeoutMS?: number;
} & Pick<EmbraceProcessorArgs, 'diag'>;
