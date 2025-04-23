import type { Span } from '@opentelemetry/api';
import {
  NoOpSpanSessionManager,
  type SpanSessionManager,
} from '../../api-sessions/index.js';

export class FakeSessionManager
  extends NoOpSpanSessionManager
  implements SpanSessionManager
{
  private _currentSessionSpan: Span | null = null;

  public get currentSessionSpan(): Span | null {
    return this._currentSessionSpan;
  }

  public set currentSessionSpan(span: Span | null) {
    this._currentSessionSpan = span;
  }

  public override getSessionSpan(): Span | null {
    return this._currentSessionSpan;
  }
}
