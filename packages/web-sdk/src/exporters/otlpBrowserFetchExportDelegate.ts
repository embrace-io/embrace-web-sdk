import {
  createOtlpNetworkExportDelegate,
  ExporterMetrics,
} from '@opentelemetry/otlp-exporter-base';
import type {
  IExporterMetricsHelper,
  ISerializer,
} from '#embrace-io/otlp-transformer'; // internal package: https://nodejs.org/api/packages.html#imports
import {
  createFetchTransport,
  createRetryingTransport,
} from '../transport/index.ts';
import { GzipSerializer } from './GzipSerializer/index.ts';
import type { OtlpFetchExporterConfig } from './types.ts';

// createOtlpBrowserFetchExportDelegate creates an export delegate that uses
// the Fetch API to send data to an OTLP receiver.
export const createOtlpBrowserFetchExportDelegate = <Internal, Response>(
  config: OtlpFetchExporterConfig,
  serializer: ISerializer<Internal, Response>,
  componentType: string,
  metricsHelper: IExporterMetricsHelper<Internal>,
) => {
  const useGzip = config.compression === 'gzip';
  const compressingSerializer = useGzip
    ? new GzipSerializer(serializer)
    : serializer;
  const headers = useGzip
    ? { ...config.headers, 'Content-Encoding': 'gzip' }
    : config.headers;

  // createOtlpNetworkExportDelegate has an internal bounded queue that tracks
  // in-flight exports and fails exports beyond config.concurrencyLimit.
  return createOtlpNetworkExportDelegate(
    config,
    compressingSerializer,
    new ExporterMetrics({
      componentType,
      metricsHelper,
      url: config.url,
      // The SDK emits no client-side metrics, so ExporterMetrics falls back
      // to a noop meter and these instruments never record anything.
      meterProvider: undefined,
      responseAttributesFromError: () => ({}),
    }),
    createRetryingTransport({
      transport: createFetchTransport({ url: config.url, headers }),
    }),
  );
};
