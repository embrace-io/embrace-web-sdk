import type { Span } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace';

export class FakeSpanProcessor implements SpanProcessor {
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEnd(this: void): void {}

  public onStart(span: Span): void {
    span.setAttributes({ fake: 'my-attr' });
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
