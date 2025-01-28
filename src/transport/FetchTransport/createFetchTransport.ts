import { FetchRequestParameters } from './types';
import { IExporterTransport } from '@opentelemetry/otlp-exporter-base';
import { FetchTransport } from './FetchTransport';

export const createFetchTransport = (
  config: FetchRequestParameters
): IExporterTransport => new FetchTransport(config);
