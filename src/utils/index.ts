export { generateUUID } from './generateUUID.js';
export { withErrorFallback } from './withErrorFallback.js';
export { bulkAddEventListener } from './bulkAddEventListener/index.js';
export { bulkRemoveEventListener } from './bulkRemoveEventListener/index.js';
export { isDeviceIdSampled } from './isDeviceIdSampled.js';
export type { TimeoutRef } from './timeout/index.js';
export {
  OTelPerformanceManager,
  type PerformanceManager,
} from './PerformanceManager/index.js';
export { throttle } from './throttle.js';
export {
  EmbraceSpanStorage,
  type SpanStorageOptions,
} from './EmbraceSpanStorage/index.js';
export { GLOBAL_CONFIG } from './globalConfig.js';
