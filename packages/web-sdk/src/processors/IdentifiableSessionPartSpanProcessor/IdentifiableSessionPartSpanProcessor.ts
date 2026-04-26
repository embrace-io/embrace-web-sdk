import type { DiagLogger, Span } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import type { SessionPartManager } from '../../api-sessions/index.ts';
import { KEY_EMB_SESSION_PART_ID } from '../../constants/index.ts';
import type { IdentifiableSessionPartSpanProcessorArgs } from './types.ts';

// Stamps `emb.session_part_id` on every span at onStart so downstream
// processors can rely on its presence to add user-session attributes.
export class IdentifiableSessionPartSpanProcessor implements SpanProcessor {
  private readonly _sessionPartManager: SessionPartManager;
  private readonly _diag: DiagLogger;

  public constructor({
    sessionPartManager,
  }: IdentifiableSessionPartSpanProcessorArgs) {
    this._sessionPartManager = sessionPartManager;
    this._diag = diag.createComponentLogger({
      namespace: 'IdentifiableSessionPartSpanProcessor',
    });
  }

  public onStart(span: Span): void {
    try {
      const partId = this._sessionPartManager.getSessionPartId();
      if (partId) {
        span.setAttribute(KEY_EMB_SESSION_PART_ID, partId);
      }
    } catch (e) {
      this._diag.warn('Error stamping session part id on span', e);
    }
  }

  public onEnd(_span: ReadableSpan): void {
    // no-op; attribution happens at onStart so other processors see the value.
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
