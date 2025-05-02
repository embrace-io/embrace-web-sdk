import type { TraceManager } from '../index.js';
import type {
  PerformanceSpan,
  PerformanceSpanOptions,
} from '../../api/index.js';

export class NoOpTraceManager implements TraceManager {
  public startPerformanceSpan(
    _name: string,
    _options?: PerformanceSpanOptions
  ): PerformanceSpan | null {
    return null;
  }
}
