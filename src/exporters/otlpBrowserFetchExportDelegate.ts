import { createOtlpNetworkExportDelegate } from '@opentelemetry/otlp-exporter-base';
import type { ISerializer } from '@opentelemetry/otlp-transformer';
import {
  createFetchTransport,
  createRetryingTransport,
} from '../transport/index.js';
import type { OtlpFetchExporterConfig } from './types.js';

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
