export { trace } from './traceAPI.js';
export type {
  TraceManager,
  PerformanceSpanFailureCode,
  PerformanceSpanFailedOptions,
} from './manager/index.js';
export { NoOpTraceManager, ProxyTraceManager } from './manager/index.js';
