import type { IExporterTransport } from '@opentelemetry/otlp-exporter-base';
import { RetryingTransport } from './RetryingTransport.js';
import { OTelPerformanceManager } from '../../utils/index.js';

/**
 * Creates an Exporter Transport that retries on 'retryable' response.
 */
export const createRetryingTransport = (options: {
  // Underlying transport to wrap.
  transport: IExporterTransport;
  // Performance manager to use.
  perf?: OTelPerformanceManager;
}): IExporterTransport =>
  new RetryingTransport(
    options.transport,
    options.perf ?? new OTelPerformanceManager()
  );
