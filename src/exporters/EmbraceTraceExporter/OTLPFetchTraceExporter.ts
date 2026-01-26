import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-web';
import { JsonTraceSerializer } from '#otlp-transformer';
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
      ),
    );
  }
}
