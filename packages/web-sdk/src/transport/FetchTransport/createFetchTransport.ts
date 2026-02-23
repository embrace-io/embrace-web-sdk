import type { IExporterTransport } from '@opentelemetry/otlp-exporter-base';
import { FetchTransport } from './FetchTransport.ts';
import type { FetchRequestParameters } from './types.ts';

export const createFetchTransport = (
  config: FetchRequestParameters,
): IExporterTransport => new FetchTransport(config);
