import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import { JsonLogsSerializer } from '@opentelemetry/otlp-transformer';
import { BaseFetchExporter } from './BaseFetchExporter';
import { OtlpFetchExporterConfig } from './types';
import { createOtlpBrowserFetchExportDelegate } from './otlpBrowserFetchExportDelegate';

export class OTLPFetchLogExporter
  extends BaseFetchExporter<ReadableLogRecord[]>
  implements LogRecordExporter
{
  constructor(config: OtlpFetchExporterConfig) {
    super(createOtlpBrowserFetchExportDelegate(config, JsonLogsSerializer));
  }
}
