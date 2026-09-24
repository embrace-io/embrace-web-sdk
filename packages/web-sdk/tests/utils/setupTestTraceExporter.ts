import { trace } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';

/**
 * Sets up an in-memory trace exporter for tests.
 * It returns an instance of InMemorySpanExporter, hooked into a SimpleSpanProcessor, and a TracerProvider.
 * */
export const setupTestTraceExporter = (
  spanProcessors: SpanProcessor[] = [],
) => {
  const memoryExporter = new InMemorySpanExporter();
  const tracerProvider = new TracerProvider({
    spanProcessors: [
      ...spanProcessors,
      new SimpleSpanProcessor({ exporter: memoryExporter }),
    ],
  });
  trace.setGlobalTracerProvider(tracerProvider);
  return memoryExporter;
};
