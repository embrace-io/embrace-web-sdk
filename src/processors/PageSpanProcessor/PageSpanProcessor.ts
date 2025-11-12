import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import type { PageManager } from '../../api-page/index.js';
import {
  EMB_TYPES,
  KEY_EMB_PAGE_ID,
  KEY_EMB_PAGE_PATH,
  KEY_EMB_TYPE,
} from '../../constants/index.js';
import type { PageSpanProcessorArgs } from './types.js';

export class PageSpanProcessor implements SpanProcessor {
  private readonly _pageManager: PageManager;

  public constructor({ pageManager }: PageSpanProcessorArgs) {
    this._pageManager = pageManager;
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  // Attach page attributes at span end to capture the page where the span completed
  public onEnd(span: ReadableSpan): void {
    if (span.attributes[KEY_EMB_TYPE] === EMB_TYPES.Surface) {
      // Don't override page attributes for surface spans
      return;
    }

    const currentRoute = this._pageManager.getCurrentRoute();
    const currentPageId = this._pageManager.getCurrentPageId();

    if (currentRoute && currentPageId) {
      span.attributes[KEY_EMB_PAGE_PATH] = currentRoute.path;
      span.attributes[KEY_EMB_PAGE_ID] = currentPageId;
    }
  }

  public onStart(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
