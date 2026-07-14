import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace';
import type { URLDocument } from '../../common/index.ts';
import { KEY_BROWSER_URL_FULL } from '../../constants/index.ts';
import type { BrowserSpanProcessorArgs } from './types.ts';

/**
 * BrowserSpanProcessor sets the browser.url.full attribute on all spans.
 */
export class BrowserSpanProcessor implements SpanProcessor {
  private readonly _urlDocument: URLDocument;

  public constructor({
    urlDocument = window.document,
  }: BrowserSpanProcessorArgs = {}) {
    this._urlDocument = urlDocument;
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEnd(span: ReadableSpan): void {
    if (!span.attributes[KEY_BROWSER_URL_FULL]) {
      span.attributes[KEY_BROWSER_URL_FULL] = this._urlDocument.URL;
    }
  }

  public onStart(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
