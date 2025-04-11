import type { SpanExporter } from '@opentelemetry/sdk-trace-web';
import type { EmbraceProcessorArgs } from '../EmbraceProcessor/index.js';

export type EmbraceSessionBatchedSpanProcessorArgs = {
  exporter: SpanExporter;
} & Pick<EmbraceProcessorArgs, 'diag'>;
