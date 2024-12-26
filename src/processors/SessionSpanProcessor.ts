import {
  ReadableSpan,
  SpanExporter,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-web';
// TODO: don't rely on internal API
import {BindOnceFuture, internal} from '@opentelemetry/core';
import {isSessionSpan} from '../instrumentations/session/util';

class SessionSpanProcessor implements SpanProcessor {
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

  private _shutdown(): Promise<void> {
    return this._exporter.shutdown();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }
}

export default SessionSpanProcessor;
