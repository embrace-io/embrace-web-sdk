import {IOtlpExportDelegate} from '@opentelemetry/otlp-exporter-base';
import {ExportResult} from '@opentelemetry/core';

export class BaseFetchExporter<Internal> {
  constructor(private _delegate: IOtlpExportDelegate<Internal>) {}

  export(
    items: Internal,
    resultCallback: (result: ExportResult) => void,
  ): void {
    this._delegate.export(items, resultCallback);
  }

  forceFlush(): Promise<void> {
    return this._delegate.forceFlush();
  }

  shutdown(): Promise<void> {
    return this._delegate.shutdown();
  }
}
