import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import type { PageManager } from '../../api-page/index.ts';
import {
  KEY_APP_SURFACE_LABEL,
  KEY_EMB_PAGE_ID,
  KEY_EMB_PAGE_PATH,
} from '../../constants/index.ts';
import type { PageSpanProcessorArgs } from './types.ts';

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
    // If the span already has page attributes, do not override them
    if (
      !span.attributes[KEY_EMB_PAGE_PATH] ||
      !span.attributes[KEY_EMB_PAGE_ID]
    ) {
      const currentRoute = this._pageManager.getCurrentRoute();
      const currentPageId = this._pageManager.getCurrentPageId();

      if (currentRoute && currentPageId) {
        span.attributes[KEY_EMB_PAGE_PATH] = currentRoute.path;
        span.attributes[KEY_EMB_PAGE_ID] = currentPageId;
      }
    }

    const appSurfaceLabel = this._pageManager.getPageLabel();
    if (appSurfaceLabel && !span.attributes[KEY_APP_SURFACE_LABEL]) {
      span.attributes[KEY_APP_SURFACE_LABEL] = appSurfaceLabel;
    }
  }

  public onStart(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
