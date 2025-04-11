import { JsonLogsSerializer } from '@opentelemetry/otlp-transformer';
import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import { BaseFetchExporter } from '../BaseFetchExporter/index.js';
import type { OtlpFetchExporterConfig } from '../index.js';
import { createOtlpBrowserFetchExportDelegate } from '../index.js';

export class OTLPFetchLogExporter
  extends BaseFetchExporter<ReadableLogRecord[]>
  implements LogRecordExporter
{
  public constructor(config: OtlpFetchExporterConfig) {
    super(createOtlpBrowserFetchExportDelegate(config, JsonLogsSerializer));
  }
}
