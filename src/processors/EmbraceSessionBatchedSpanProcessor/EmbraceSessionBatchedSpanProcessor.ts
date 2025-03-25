import { BindOnceFuture, internal } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-web'; // TODO: don't rely on internal API
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import type { SessionSpan } from '../../instrumentations/index.js';
import { EmbraceProcessor } from '../EmbraceProcessor/index.js';
import type { EmbraceSessionBatchedSpanProcessorArgs } from './types.js';

const isSessionSpan = (span: ReadableSpan | SessionSpan): span is SessionSpan =>
  span.attributes[KEY_EMB_TYPE] === EMB_TYPES.Session;

export class EmbraceSessionBatchedSpanProcessor extends EmbraceProcessor {
  private readonly _shutdownOnce: BindOnceFuture<void>;
  private _pendingSpans: ReadableSpan[] = [];
  private readonly _exporter: SpanExporter;

  public constructor({
    exporter,
    ...parentArgs
  }: EmbraceSessionBatchedSpanProcessorArgs) {
    super({
      ...parentArgs,
      processorName: 'EmbraceSessionBatchedSpanProcessor'
    });
    this._exporter = exporter;
    this._shutdownOnce = new BindOnceFuture(this._shutdown, this);
  }

  public override forceFlush(): Promise<void> {
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
      this._pendingSpans = [];
    }
  }

  public override onStart(): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return this._shutdownOnce.call();
  }

  private readonly _shutdown = () => {
    return this._exporter.shutdown();
  };
}
