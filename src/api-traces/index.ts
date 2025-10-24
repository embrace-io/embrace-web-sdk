export type {
  ExtendedSpan,
  ExtendedSpanFailedOptions,
  ExtendedSpanOptions,
} from './api/index.js';
export type { TraceManager, TraceManagerArgs } from './manager/index.js';
export { NoOpTraceManager, ProxyTraceManager } from './manager/index.js';
export { trace } from './traceAPI.js';
