import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-web';
import { BaseFetchExporter } from '../BaseFetchExporter/index.js';
import type { OtlpFetchExporterConfig } from '../index.js';
import { createOtlpBrowserFetchExportDelegate } from '../index.js';

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
        JsonTraceSerializer
      )
    );
  }
}
