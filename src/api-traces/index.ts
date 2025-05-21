export { trace } from './traceAPI.js';
export type { TraceManager } from './manager/index.js';
export { NoOpTraceManager, ProxyTraceManager } from './manager/index.js';
export type {
  EmbraceExtendedSpan,
  EmbraceExtendedSpanFailedOptions,
  EmbraceExtendedSpanOptions,
} from './api/index.js';
