import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-web';
import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer';
import { BaseFetchExporter } from './BaseFetchExporter/index.js';
import { OtlpFetchExporterConfig } from './types.js';
import { createOtlpBrowserFetchExportDelegate } from './otlpBrowserFetchExportDelegate.js';

export class OTLPFetchTraceExporter
  extends BaseFetchExporter<ReadableSpan[]>
  implements SpanExporter
{
  constructor(config: OtlpFetchExporterConfig) {
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
