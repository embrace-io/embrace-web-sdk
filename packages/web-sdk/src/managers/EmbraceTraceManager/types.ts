import type { TraceManagerArgs } from '../../api-traces/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';

export interface EmbraceTraceManagerArgs extends TraceManagerArgs {
  /** Used to default span start and end times, so they follow the wall clock across a sleep. */
  perf?: PerformanceManager;
}
