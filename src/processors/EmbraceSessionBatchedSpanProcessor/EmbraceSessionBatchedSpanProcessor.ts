import { BindOnceFuture, internal } from '@opentelemetry/core';
import type {
  ReadableSpan,
  SpanExporter,
  SpanProcessor
} from '@opentelemetry/sdk-trace-web'; // TODO: don't rely on internal API
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import type { SessionSpan } from '../../instrumentations/index.js';

const isSessionSpan = (span: ReadableSpan | SessionSpan): span is SessionSpan =>
  span.attributes[KEY_EMB_TYPE] === EMB_TYPES.Session;

export class EmbraceSessionBatchedSpanProcessor implements SpanProcessor {
  private readonly _shutdownOnce: BindOnceFuture<void>;
  private readonly _pendingSpans: ReadableSpan[] = [];

  public constructor(private readonly _exporter: SpanExporter) {
    this._shutdownOnce = new BindOnceFuture(this._shutdown, this);
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEnd(span: ReadableSpan): void {
    if (this._shutdownOnce.isCalled) {
      return;
    }

    if (!isSessionSpan(span)) {
      this._pendingSpans.push(span);
    } else {
      // TODO: handle errors
      void internal._export(this._exporter, [span, ...this._pendingSpans]);
    }
  }

  public onStart(): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return this._shutdownOnce.call();
  }

  private readonly _shutdown = () => {
    return this._exporter.shutdown();
  };
}
