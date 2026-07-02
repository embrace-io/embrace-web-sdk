import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type { PageManager } from '../../api-page/manager/types.ts';
import {
  KEY_APP_SURFACE_LABEL,
  KEY_EMB_PAGE_ID,
  KEY_EMB_PAGE_PATH,
} from '../../constants/attributes.ts';
import type { PageLogRecordProcessorArgs } from './types.ts';

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
    // If the log already has page attributes, do not override them
    if (
      !logRecord.attributes[KEY_EMB_PAGE_PATH] ||
      !logRecord.attributes[KEY_EMB_PAGE_ID]
    ) {
      const currentRoute = this._pageManager.getCurrentRoute();

      if (currentRoute) {
        logRecord.setAttribute(KEY_EMB_PAGE_PATH, currentRoute.path);
        logRecord.setAttribute(
          KEY_EMB_PAGE_ID,
          this._pageManager.getCurrentPageId(),
        );
      }
    }

    const appSurfaceLabel = this._pageManager.getPageLabel();
    if (appSurfaceLabel && !logRecord.attributes[KEY_APP_SURFACE_LABEL]) {
      logRecord.setAttribute(KEY_APP_SURFACE_LABEL, appSurfaceLabel);
    }
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
