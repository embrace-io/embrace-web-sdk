import type { HrTime, Span } from '@opentelemetry/api';
import type {
  ReasonSessionEnded,
  SpanSessionManager,
} from '../../api-sessions/index.js';

export class FakeSessionManager implements SpanSessionManager {
  private _currentSessionSpan: Span | null = null;

  public get currentSessionSpan(): Span | null {
    return this._currentSessionSpan;
  }

  public set currentSessionSpan(span: Span | null) {
    this._currentSessionSpan = span;
  }

  public addBreadcrumb(_name: string): void {
    // No-op
  }

  public addProperty(_key: string, _value: string): void {
    // No-op
  }

  public endSessionSpan(): void {
    // No-op
  }

  public endSessionSpanInternal(_reason: ReasonSessionEnded): void {
    // No-op
  }

  public getSessionId(): string | null {
    return null;
  }

  public getSessionSpan(): Span | null {
    return this._currentSessionSpan;
  }

  public getSessionStartTime(): HrTime | null {
    return null;
  }

  public startSessionSpan(): void {}
}
