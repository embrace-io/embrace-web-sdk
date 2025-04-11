export { session } from './sessionAPI.js';
export type {
  SpanSessionManager,
  ReasonSessionEnded,
} from './manager/index.js';
export {
  NoOpSpanSessionManager,
  ProxySpanSessionManager,
} from './manager/index.js';
