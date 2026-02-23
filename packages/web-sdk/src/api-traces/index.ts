export type {
  ExtendedSpan,
  ExtendedSpanFailedOptions,
  ExtendedSpanOptions,
} from './api/index.ts';
export type { TraceManager, TraceManagerArgs } from './manager/index.ts';
export { NoOpTraceManager, ProxyTraceManager } from './manager/index.ts';
export { trace } from './traceAPI.ts';
