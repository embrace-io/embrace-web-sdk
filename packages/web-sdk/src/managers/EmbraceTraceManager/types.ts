import type { TracerProviderOptions } from '@opentelemetry/sdk-trace';
import type { PerformanceManager } from '../../utils/index.ts';

export interface EmbraceTracerProviderArgs extends TracerProviderOptions {
  perf: PerformanceManager;
}
