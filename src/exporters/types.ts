import {OtlpSharedConfiguration} from '@opentelemetry/otlp-exporter-base';

interface OtlpFetchExporterConfig extends OtlpSharedConfiguration {
  url: string;
  headers: Record<string, string>;
  keepalive?: boolean;
}

export type {OtlpFetchExporterConfig};
