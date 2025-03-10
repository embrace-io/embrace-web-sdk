import type { FetchRequestParameters } from './types.js';
import type { IExporterTransport } from '@opentelemetry/otlp-exporter-base';
import { FetchTransport } from './FetchTransport.js';

export const createFetchTransport = (
  config: FetchRequestParameters
): IExporterTransport => new FetchTransport(config);
