import { logs } from '@opentelemetry/api-logs';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';

/**
 * Sets up an in-memory log exporter for tests.
 * It returns an instance of InMemoryLogRecordExporter, hooked into a SimpleLogRecordProcessor, and a LoggerProvider.
 * */
export const setupTestLogExporter = (
  logProcessors: LogRecordProcessor[] = [],
) => {
  const memoryExporter = new InMemoryLogRecordExporter();
  const logProvider = new LoggerProvider({
    processors: [
      ...logProcessors,
      new SimpleLogRecordProcessor({ exporter: memoryExporter }),
    ],
  });
  logs.setGlobalLoggerProvider(logProvider);
  return memoryExporter;
};
