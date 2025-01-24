import {ReadableSpan, SpanExporter} from '@opentelemetry/sdk-trace-web';
import {JsonTraceSerializer} from '@opentelemetry/otlp-transformer';
import {BaseFetchExporter} from './BaseFetchExporter';
import {OtlpFetchExporterConfig} from './types';
import {createOtlpBrowserFetchExportDelegate} from './otlpBrowserFetchExportDelegate';

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
        JsonTraceSerializer,
      ),
    );
  }
}
