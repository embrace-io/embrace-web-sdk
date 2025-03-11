import { IOtlpExportDelegate } from '@opentelemetry/otlp-exporter-base';
import { ExportResult } from '@opentelemetry/core';

export class BaseFetchExporter<Internal> {
  public constructor(
    private readonly _delegate: IOtlpExportDelegate<Internal>
  ) {}

  public export(
    items: Internal,
    resultCallback: (result: ExportResult) => void
  ): void {
    this._delegate.export(items, resultCallback);
  }

  public forceFlush(): Promise<void> {
    return this._delegate.forceFlush();
  }

  public shutdown(): Promise<void> {
    return this._delegate.shutdown();
  }
}
