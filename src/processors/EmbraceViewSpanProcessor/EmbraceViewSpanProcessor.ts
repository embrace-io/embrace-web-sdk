import { SpanProcessor } from '@opentelemetry/sdk-trace-web';
import { isViewSpan } from './types.js';
import { ATTR_URL_PATH } from '@opentelemetry/semantic-conventions';
import { Span } from '@opentelemetry/sdk-trace-base/build/src/Span';
import { KEY_VIEW_NAME } from './constants.js';

/**
 * Embrace's API expects view spans to have it url att as view.path. This maps it to it
 */
export class EmbraceViewSpanProcessor implements SpanProcessor {
  onStart(span: Span): void {
    if (isViewSpan(span)) {
      span.attributes[KEY_VIEW_NAME] = span.attributes[ATTR_URL_PATH];
    }
  }

  onEnd(): void {}

  forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
