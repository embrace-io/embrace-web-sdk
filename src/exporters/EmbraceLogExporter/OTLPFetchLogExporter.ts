import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import { JsonLogsSerializer } from '#otlp-transformer';
import { BaseFetchExporter } from '../BaseFetchExporter/index.ts';
import { createOtlpBrowserFetchExportDelegate } from '../otlpBrowserFetchExportDelegate.ts';
import type { OtlpFetchExporterConfig } from '../types.ts';

export class OTLPFetchLogExporter
  extends BaseFetchExporter<ReadableLogRecord[]>
  implements LogRecordExporter
{
  public constructor(config: OtlpFetchExporterConfig) {
    super(createOtlpBrowserFetchExportDelegate(config, JsonLogsSerializer));
  }
}
