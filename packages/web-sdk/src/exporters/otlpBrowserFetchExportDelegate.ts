import { createOtlpNetworkExportDelegate } from '@opentelemetry/otlp-exporter-base';
import type { ISerializer } from '#embrace-io/otlp-transformer'; // internal package: https://nodejs.org/api/packages.html#imports
import { createFetchTransport } from '../transport/FetchTransport/createFetchTransport.ts';
import { createRetryingTransport } from '../transport/RetryingTransport/createRetryingTransport.ts';
import type { OtlpFetchExporterConfig } from './types.ts';

// createOtlpBrowserFetchExportDelegate creates an export delegate that uses
// the Fetch API to send data to an OTLP receiver.
export const createOtlpBrowserFetchExportDelegate = <Internal, Response>(
  config: OtlpFetchExporterConfig,
  serializer: ISerializer<Internal, Response>,
) =>
  // createOtlpNetworkExportDelegate has an internal queue that handles
  // multiple requests going at the same time.
  createOtlpNetworkExportDelegate(
    config,
    serializer,
    createRetryingTransport({
      transport: createFetchTransport(config),
    }),
  );
