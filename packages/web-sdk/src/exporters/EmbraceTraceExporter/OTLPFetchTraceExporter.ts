import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';
import {
  JsonTraceSerializer,
  TraceExporterMetricsHelper,
} from '#embrace-io/otlp-transformer'; // internal package: https://nodejs.org/api/packages.html#imports
import { BaseFetchExporter } from '../BaseFetchExporter/index.ts';
import { createOtlpBrowserFetchExportDelegate } from '../otlpBrowserFetchExportDelegate.ts';
import type { OtlpFetchExporterConfig } from '../types.ts';

export class OTLPFetchTraceExporter
  extends BaseFetchExporter<ReadableSpan[]>
  implements SpanExporter
{
  public constructor(config: OtlpFetchExporterConfig) {
    super(
      createOtlpBrowserFetchExportDelegate(
        {
          ...config,
          compression: 'gzip',
        },
        JsonTraceSerializer,
        'otlp_http_span_exporter',
        TraceExporterMetricsHelper,
      ),
    );
  }
}
