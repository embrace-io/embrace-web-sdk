import {
  ReadableSpan,
  SpanExporter,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-web';
// TODO: don't rely on internal API
import { BindOnceFuture, internal } from '@opentelemetry/core';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import { SessionSpan } from '../../instrumentations/index.js';
import { EmbraceSessionBatchedSpanProcessorArgs } from './types.js';
import { diag, DiagLogger } from '@opentelemetry/api';
import { MAX_BATCH_PAYLOAD_SIZE } from './constants.js';
import { session, SpanSessionManager } from '../../api-sessions/index.js';

const isSessionSpan = (
  span: ReadableSpan | SessionSpan
): span is SessionSpan => {
  return span.attributes[KEY_EMB_TYPE] === EMB_TYPES.Session;
};
// TODO we should revisit this after taking a look at packages/opentelemetry-sdk-trace-base/src/export/BatchSpanProcessorBase.ts .
//  there are several improvements we could copy (max batch, max queue, error handling, etc)
export class EmbraceSessionBatchedSpanProcessor implements SpanProcessor {
  protected _diag: DiagLogger;
  private _shutdownOnce: BindOnceFuture<void>;
  private _batchPayloadSize: number = 0;
  private _encoder = new TextEncoder();
  private _pendingSpans: ReadableSpan[] = [];
  private readonly _sessionManager: SpanSessionManager;
  private readonly _exporter: SpanExporter;

  constructor({ exporter }: EmbraceSessionBatchedSpanProcessorArgs) {
    this._exporter = exporter;
    this._sessionManager = session.getSpanSessionManager();
    this._shutdownOnce = new BindOnceFuture(this._shutdown, this);
    this._diag = diag.createComponentLogger({
      namespace: 'EmbraceSessionBatchedSpanProcessor',
    });
  }

  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    if (this._shutdownOnce.isCalled) {
      return;
    }

    if (!isSessionSpan(span)) {
      // estimate the size of this span
      // NOTE: this is a very rough estimate, as the actual size sent over the internet will be based on the encoded version
      // of the span, and not the JS representation of it. Reference to the actual representation encoding here https://github.com/open-telemetry/opentelemetry-js/blob/8e5049877abace7734fd2da53ea489c0414d8841/experimental/packages/otlp-transformer/src/trace/internal.ts#L107
      try {
        const spanSize = this._encoder.encode(JSON.stringify(span)).length;
        this._batchPayloadSize += spanSize;
      } catch (e) {
        this._diag.warn(
          'Error encoding span. Skipping while computing the max payload size.',
          e
        );
      }
      this._pendingSpans.push(span);
      // if adding the current span to the queue makes it too large, finish the current session.
      // NOTE: the MAX_BATCH_PAYLOAD_SIZE limit is not a hard limit. We trigger the max once we surpassed the limit, and not before,
      // so we always allow ONE more span into the batch than what MAX_BATCH_PAYLOAD_SIZE allows.
      // TODO make this a hard limit, finishing the current session before adding the new span to the batch
      if (this._batchPayloadSize > MAX_BATCH_PAYLOAD_SIZE) {
        this._sessionManager.endSessionSpan();
        this._sessionManager.startSessionSpan();
      }
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
