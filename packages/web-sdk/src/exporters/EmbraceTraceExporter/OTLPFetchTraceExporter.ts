import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-web';
import { JsonTraceSerializer } from '#embrace-io/otlp-transformer'; // internal package: https://nodejs.org/api/packages.html#imports
import { BaseFetchExporter } from '../BaseFetchExporter/BaseFetchExporter.ts';
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
      ),
    );
  }
}
