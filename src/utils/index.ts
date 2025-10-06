export { generateUUID } from './generateUUID.js';
export { withErrorFallback } from './withErrorFallback.js';
export { bulkAddEventListener } from './bulkAddEventListener/index.js';
export { bulkRemoveEventListener } from './bulkRemoveEventListener/index.js';
export { isDeviceIdEnabled } from './isDeviceIdEnabled.js';
export { nsfConfigValidation } from './nsfConfigValidation.js';
export { getIncrementedCount } from './getIncrementedCount.js';
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
export { NamespacedStorage } from './NamespacedStorage/index.js';
export { GLOBAL_CONFIG } from './globalConfig.js';
