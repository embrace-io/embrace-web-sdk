import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import { JsonLogsSerializer } from '@opentelemetry/otlp-transformer';
import { BaseFetchExporter } from './BaseFetchExporter/index.js';
import { OtlpFetchExporterConfig } from './types.js';
import { createOtlpBrowserFetchExportDelegate } from './otlpBrowserFetchExportDelegate.js';

export class OTLPFetchLogExporter
  extends BaseFetchExporter<ReadableLogRecord[]>
  implements LogRecordExporter
{
  constructor(config: OtlpFetchExporterConfig) {
    super(createOtlpBrowserFetchExportDelegate(config, JsonLogsSerializer));
  }
}
