import type { SpanExporter } from '@opentelemetry/sdk-trace-web';
import type { EmbraceProcessorArgs } from '../EmbraceProcessor/index.js';
import type { LimitManagerInternal } from '../../managers/index.js';

export type EmbraceSessionBatchedSpanProcessorArgs = {
  exporter: SpanExporter;
  limitManager: LimitManagerInternal;
} & Pick<EmbraceProcessorArgs, 'diag'>;
