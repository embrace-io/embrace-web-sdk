import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type { PageLogRecordProcessorArgs } from './types.js';
import { KEY_EMB_PAGE_ID, KEY_EMB_PAGE_PATH } from '../../constants/index.js';
import type { PageManager } from '../../api-page/index.js';

export class PageLogRecordProcessor implements LogRecordProcessor {
  private readonly _pageManager: PageManager;

  public constructor({ pageManager }: PageLogRecordProcessorArgs) {
    this._pageManager = pageManager;
  }

  // no-op
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: SdkLogRecord): void {
    const currentRoute = this._pageManager.getCurrentRoute();

    if (currentRoute) {
      logRecord.setAttribute(KEY_EMB_PAGE_PATH, currentRoute.path);
      logRecord.setAttribute(
        KEY_EMB_PAGE_ID,
        this._pageManager.getCurrentPageId()
      );
    }
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
