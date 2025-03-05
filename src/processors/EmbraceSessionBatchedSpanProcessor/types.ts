import { SpanExporter } from '@opentelemetry/sdk-trace-web';

export interface EmbraceSessionBatchedSpanProcessorArgs {
  exporter: SpanExporter;
}
