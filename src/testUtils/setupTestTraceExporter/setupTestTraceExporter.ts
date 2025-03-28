import { trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';

/**
 * setupTestTraceExporter is a utility function that sets up a test trace exporter for use in testing.
 * It returns an instance of InMemorySpanExporter, hooked into a SimpleSpanProcessor, and a WebTracerProvider.
 * */
export const setupTestTraceExporter = () => {
  const memoryExporter = new InMemorySpanExporter();
  const tracerProvider = new WebTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  trace.setGlobalTracerProvider(tracerProvider);
  return memoryExporter;
};
