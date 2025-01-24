import {IExporterTransport} from '@opentelemetry/otlp-exporter-base';
import {RetryingTransport} from './RetryingTransport';

/**
 * Creates an Exporter Transport that retries on 'retryable' response.
 */
export const createRetryingTransport = (options: {
  // Underlying transport to wrap.
  transport: IExporterTransport;
}): IExporterTransport => new RetryingTransport(options.transport);
