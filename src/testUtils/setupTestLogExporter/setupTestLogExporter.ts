import { logs } from '@opentelemetry/api-logs';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';

/**
 * setupTestLogExporter is a utility function that sets up a test log exporter for use in testing.
 * It returns an instance of InMemoryLogRecordExporter, hooked into a SimpleLogRecordProcessor, and a LoggerProvider.
 * */
export const setupTestLogExporter = (
  logProcessors: LogRecordProcessor[] = []
) => {
  const memoryExporter = new InMemoryLogRecordExporter();
  const logProvider = new LoggerProvider();
  logProcessors.forEach(processor => {
    logProvider.addLogRecordProcessor(processor);
  });
  logProvider.addLogRecordProcessor(
    new SimpleLogRecordProcessor(memoryExporter)
  );
  logs.setGlobalLoggerProvider(logProvider);
  return memoryExporter;
};
