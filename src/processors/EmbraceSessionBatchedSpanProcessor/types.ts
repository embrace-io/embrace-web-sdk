import type { SpanExporter } from '@opentelemetry/sdk-trace-web';
import type { EmbraceProcessorArgs } from '../EmbraceProcessor/types.js';

export type EmbraceSessionBatchedSpanProcessorArgs = {
  exporter: SpanExporter;
} & Pick<EmbraceProcessorArgs, 'perf' | 'diag'>;
