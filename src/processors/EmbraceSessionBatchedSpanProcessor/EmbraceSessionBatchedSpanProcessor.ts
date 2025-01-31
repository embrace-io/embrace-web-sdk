import {
  ReadableSpan,
  SpanExporter,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-web';
// TODO: don't rely on internal API
import {BindOnceFuture, internal} from '@opentelemetry/core';
import {EMB_TYPES, KEY_EMB_TYPE} from '../../constants';
import {SessionSpan} from '../../instrumentations';

const isSessionSpan = (
  span: ReadableSpan | SessionSpan,
): span is SessionSpan => {
  return span.attributes[KEY_EMB_TYPE] === EMB_TYPES.Session;
};

export class EmbraceSessionBatchedSpanProcessor implements SpanProcessor {
  private _shutdownOnce: BindOnceFuture<void>;
  private _pendingSpans: ReadableSpan[] = [];

  constructor(private readonly _exporter: SpanExporter) {
    this._shutdownOnce = new BindOnceFuture(this._shutdown, this);
  }

  onStart(): void {}

  onEnd(span: ReadableSpan): void {
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

  shutdown(): Promise<void> {
    return this._shutdownOnce.call();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  private _shutdown(): Promise<void> {
    return this._exporter.shutdown();
  }
}
