import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type { PageLogRecordProcessorArgs, PageProvider } from './types.js';
import { KEY_EMB_PAGE_ID, KEY_EMB_PAGE_PATH } from '../../constants/index.js';

export class PageLogRecordProcessor implements LogRecordProcessor {
  private readonly _pageProvider: PageProvider;

  public constructor({ pageProvider }: PageLogRecordProcessorArgs) {
    this._pageProvider = pageProvider;
  }

  // no-op
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord): void {
    const currentRoute = this._pageProvider.getCurrentRoute();

    if (currentRoute) {
      logRecord.setAttribute(KEY_EMB_PAGE_PATH, currentRoute.path);
      logRecord.setAttribute(
        KEY_EMB_PAGE_ID,
        this._pageProvider.getCurrentPageId()
      );
    }
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
