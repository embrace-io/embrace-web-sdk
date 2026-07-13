import { trace } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';

/**
 * setupTestTraceExporter is a utility function that sets up a test trace exporter for use in testing.
 * It returns an instance of InMemorySpanExporter, hooked into a SimpleSpanProcessor, and a TracerProvider.
 * */
export const setupTestTraceExporter = (
  spanProcessors: SpanProcessor[] = [],
) => {
  const memoryExporter = new InMemorySpanExporter();
  const tracerProvider = new TracerProvider({
    spanProcessors: [
      ...spanProcessors,
      new SimpleSpanProcessor(memoryExporter),
    ],
  });
  trace.setGlobalTracerProvider(tracerProvider);
  return memoryExporter;
};
