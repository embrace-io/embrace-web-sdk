import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import type { SpanScrubProcessorArgs } from './types.js';
import type { AttributeScrubber } from '../../common/index.js';

export class SpanScrubProcessor implements SpanProcessor {
  private readonly _attributeScrubbers: AttributeScrubber[];

  public constructor({ attributeScrubbers }: SpanScrubProcessorArgs) {
    this._attributeScrubbers = attributeScrubbers;
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  // TODO `onEnd` is not supposed to modify the span. There is a new experimental onEnding api that allows modifying
  public onEnd(span: ReadableSpan): void {
    this._attributeScrubbers.forEach(scrubber => {
      const value = span.attributes[scrubber.key];
      if (value && typeof value === 'string') {
        span.attributes[scrubber.key] = scrubber.scrub(value);
      }
    });
  }

  public onStart(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
