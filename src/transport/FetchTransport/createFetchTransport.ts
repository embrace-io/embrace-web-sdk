import type { IExporterTransport } from '@opentelemetry/otlp-exporter-base';
import { FetchTransport } from './FetchTransport.js';
import type { FetchRequestParameters } from './types.js';

export const createFetchTransport = (
  config: FetchRequestParameters
): IExporterTransport => new FetchTransport(config);
