export { trace } from './traceAPI.js';
export type { TraceManager } from './manager/index.js';
export { NoOpTraceManager, ProxyTraceManager } from './manager/index.js';
export type {
  ExtendedSpan,
  ExtendedSpanFailedOptions,
  ExtendedSpanOptions,
} from './api/index.js';
