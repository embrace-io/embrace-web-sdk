import { createOtlpNetworkExportDelegate } from '@opentelemetry/otlp-exporter-base';
import { ISerializer } from '@opentelemetry/otlp-transformer';
import { createFetchTransport, createRetryingTransport } from '../transport';
import { OtlpFetchExporterConfig } from './types';

// createOtlpBrowserFetchExportDelegate creates an export delegate that uses
// the Fetch API to send data to an OTLP receiver.
export const createOtlpBrowserFetchExportDelegate = <Internal, Response>(
  config: OtlpFetchExporterConfig,
  serializer: ISerializer<Internal, Response>
) =>
  // createOtlpNetworkExportDelegate has an internal queue that handles
  // multiple requests going at the same time.
  createOtlpNetworkExportDelegate(
    config,
    serializer,
    createRetryingTransport({
      transport: createFetchTransport(config),
    })
  );
