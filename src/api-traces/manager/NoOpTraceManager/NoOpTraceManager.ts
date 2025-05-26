import type { TraceManager } from '../index.js';
import type { ExtendedSpan, ExtendedSpanOptions } from '../../api/index.js';

export class NoOpTraceManager implements TraceManager {
  public startSpan(
    _name: string,
    _options?: ExtendedSpanOptions
  ): ExtendedSpan | null {
    return null;
  }
}
