import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import type { PageSpanProcessorArgs, PageProvider } from './types.js';
import { KEY_EMB_PAGE_ID, KEY_EMB_PAGE_PATH } from '../../constants/index.js';

export class PageSpanProcessor implements SpanProcessor {
  private readonly _pageProvider: PageProvider;

  public constructor({ pageProvider }: PageSpanProcessorArgs) {
    this._pageProvider = pageProvider;
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  // Attach page attributes at span end to capture the page where the span completed
  public onEnd(span: ReadableSpan): void {
    const currentRoute = this._pageProvider.getCurrentRoute();
    const currentPageId = this._pageProvider.getCurrentPageId();

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
