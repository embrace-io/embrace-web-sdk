import type { DiagLogger, Span } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import { KEY_EMB_SESSION_PART_ID } from '../../constants/index.ts';
import type { UserSessionManagerInternal } from '../../managers/EmbraceUserSessionManager/index.ts';
import type { IdentifiableSessionPartSpanProcessorArgs } from './types.ts';

export class IdentifiableSessionPartSpanProcessor implements SpanProcessor {
  private readonly _userSessionManager: UserSessionManagerInternal;
  private readonly _diag: DiagLogger;

  public constructor({
    userSessionManager,
  }: IdentifiableSessionPartSpanProcessorArgs) {
    this._userSessionManager = userSessionManager;
    this._diag = diag.createComponentLogger({
      namespace: 'IdentifiableSessionPartSpanProcessor',
    });
  }

  public onStart(span: Span): void {
    try {
      const partId = this._userSessionManager.getSessionPartId() ?? '';
      span.setAttribute(KEY_EMB_SESSION_PART_ID, partId);
    } catch (e) {
      this._diag.warn('Error stamping session part id on span', e);
    }
  }

  public onEnd(_span: ReadableSpan): void {}

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
