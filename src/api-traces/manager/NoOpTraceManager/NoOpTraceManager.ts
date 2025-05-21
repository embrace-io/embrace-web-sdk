import type { TraceManager } from '../index.js';
import type {
  EmbraceExtendedSpan,
  EmbraceExtendedSpanOptions,
} from '../../api/index.js';

export class NoOpTraceManager implements TraceManager {
  public startSpan(
    _name: string,
    _options?: EmbraceExtendedSpanOptions
  ): EmbraceExtendedSpan | null {
    return null;
  }
}
