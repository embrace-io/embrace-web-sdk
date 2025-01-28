import { FetchRequestParameters } from './types.js';
import { IExporterTransport } from '@opentelemetry/otlp-exporter-base';
import { FetchTransport } from './FetchTransport.js';

export const createFetchTransport = (
  config: FetchRequestParameters
): IExporterTransport => new FetchTransport(config);
