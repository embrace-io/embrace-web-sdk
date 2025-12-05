import type { IExporterTransport } from '@opentelemetry/otlp-exporter-base';
import { OTelPerformanceManager } from '../../utils/index.ts';
import { RetryingTransport } from './RetryingTransport.ts';

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
    options.perf ?? new OTelPerformanceManager(),
  );
