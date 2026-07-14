import type { Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import type { AttributeScrubber } from '../../common/index.ts';
import type { SpanScrubProcessorArgs } from './types.ts';

export class SpanScrubProcessor implements SpanProcessor {
  private readonly _attributeScrubbers: AttributeScrubber[];

  public constructor({ attributeScrubbers }: SpanScrubProcessorArgs) {
    this._attributeScrubbers = attributeScrubbers;
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEnding(span: Span): void {
    this._attributeScrubbers.forEach((scrubber) => {
      const value = span.attributes[scrubber.key];
      if (value && typeof value === 'string') {
        span.attributes[scrubber.key] = scrubber.scrub(value);
      }
    });
  }

  public onStart(this: void): void {
    // do nothing.
  }

  public onEnd(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
