import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import {
  BindOnceFuture,
  ExportResultCode,
  internal,
} from '@opentelemetry/core';
import type {
  ReadableSpan,
  SpanExporter,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-web'; // TODO: don't rely on internal API
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import type { SessionPartSpan } from '../../instrumentations/index.ts';
import type {
  LimitManagerInternal,
  UserSessionManagerInternal,
} from '../../managers/index.ts';
import type { EmbraceSessionBatchedSpanProcessorArgs } from './types.ts';

const isSessionPartSpan = (
  span: ReadableSpan | SessionPartSpan,
): span is SessionPartSpan =>
  span.attributes[KEY_EMB_TYPE] === EMB_TYPES.SessionPart;

type ExportFailureReason = 'concurrent_limit' | 'fetch_error' | 'unknown';

const exportFailureAttributeKey = (
  reason: ExportFailureReason,
  session: 'current' | 'previous',
) =>
  `emb.${session === 'current' ? 'export_failed' : 'previous_export_failed'}.${reason}`;

export class EmbraceSessionBatchedSpanProcessor implements SpanProcessor {
  private readonly _shutdownOnce: BindOnceFuture<void>;
  private _pendingSpans: ReadableSpan[] = [];
  private readonly _exporter: SpanExporter;
  private readonly _limitManager: LimitManagerInternal;
  private readonly _userSessionManager: UserSessionManagerInternal;
  private readonly _diag: DiagLogger;

  public constructor({
    exporter,
    limitManager,
    userSessionManager,
    diag: diagParam = diag.createComponentLogger({
      namespace: 'EmbraceSessionBatchedSpanProcessor',
    }),
  }: EmbraceSessionBatchedSpanProcessorArgs) {
    this._diag = diagParam;
    this._exporter = exporter;
    this._shutdownOnce = new BindOnceFuture(this._shutdown, this);
    this._limitManager = limitManager;
    this._userSessionManager = userSessionManager;
  }

  public forceFlush(): Promise<void> {
    this._diag.debug(
      'forceFlush called for EmbraceSessionBatchedSpanProcessor. This is a no op',
    );
    return Promise.resolve(undefined);
  }

  public onEnd(span: ReadableSpan): void {
    if (this._shutdownOnce.isCalled) {
      this._diag.debug('span ended after processor shutdown. Ignoring span.');
      return;
    }

    if (!isSessionPartSpan(span)) {
      this._diag.debug(
        'non-session span ended. Adding to pending spans queue.',
      );
      if (this._limitManager.dropReadableSpan(span)) {
        return;
      }
      this._pendingSpans.push(span);
    } else {
      this._diag.debug('session part span ended. Exporting all pending spans.');
      this._exportSpans([span, ...this._pendingSpans]);
      this._pendingSpans = [];
    }
  }

  private _exportSpans(spans: ReadableSpan[]): void {
    internal
      ._export(this._exporter, spans)
      .then((result: ExportResult) => {
        if (result.code === ExportResultCode.FAILED) {
          const errorMessage = result.error?.message || 'unknown error';
          let failureReason: ExportFailureReason = 'unknown';

          if (errorMessage === 'Concurrent export limit reached') {
            failureReason = 'concurrent_limit';
          } else if (errorMessage === 'Fetch request errored') {
            failureReason = 'fetch_error';
          }

          this._userSessionManager.incrSessionPartCountForKey(
            exportFailureAttributeKey(failureReason, 'current'),
          );
          this._userSessionManager.incrNextSessionPartCountForKey(
            exportFailureAttributeKey(failureReason, 'previous'),
          );
          this._diag.error(`spans failed to export: ${errorMessage}`);
        }
      })
      // Seems like everything related to the export logic does a good job of catching and only ever resolving with
      // an ExportResult even on failure: https://github.com/open-telemetry/opentelemetry-js/blob/cf6dffeebcf72c42b2cb4d2bf2db720369b53081/packages/opentelemetry-core/src/internal/exporter.ts#L37
      // Keep this block just in case that assumption changes in a future version
      .catch((reason: unknown) => {
        let msg = 'unknown error';
        if (reason && reason instanceof Error) {
          msg = reason.message;
        } else if (typeof reason === 'string') {
          msg = reason;
        }

        this._userSessionManager.incrSessionPartCountForKey(
          exportFailureAttributeKey('unknown', 'current'),
        );
        this._userSessionManager.incrNextSessionPartCountForKey(
          exportFailureAttributeKey('unknown', 'previous'),
        );
        this._diag.error(`spans failed to export: ${msg}`);
      });
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
