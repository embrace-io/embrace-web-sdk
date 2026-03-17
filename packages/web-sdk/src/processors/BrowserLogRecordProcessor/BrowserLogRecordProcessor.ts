import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type { URLDocument } from '../../common/index.ts';
import { KEY_BROWSER_URL_FULL } from '../../constants/index.ts';
import type { BrowserLogRecordProcessorArgs } from './types.ts';

/**
 * BrowserLogRecordProcessor sets the browser.url.full attribute on all log records.
 */
export class BrowserLogRecordProcessor implements LogRecordProcessor {
  private readonly _urlDocument: URLDocument;

  public constructor({
    urlDocument = window.document,
  }: BrowserLogRecordProcessorArgs = {}) {
    this._urlDocument = urlDocument;
  }

  // no-op
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord): void {
    logRecord.setAttribute(KEY_BROWSER_URL_FULL, this._urlDocument.URL);
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
