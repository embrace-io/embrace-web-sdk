export { bulkAddEventListener } from './bulkAddEventListener/index.ts';
export { bulkRemoveEventListener } from './bulkRemoveEventListener/index.ts';
export {
  EmbraceSpanStorage,
  type SpanStorageOptions,
} from './EmbraceSpanStorage/index.ts';
export { generateUUID } from './generateUUID.ts';
export { getIncrementedCount } from './getIncrementedCount.ts';
export { getVisibilityState } from './getVisibilityState.ts';
export { GLOBAL_CONFIG } from './globalConfig.ts';
export { isDeviceIdEnabled } from './isDeviceIdEnabled.ts';
export { NamespacedStorage } from './NamespacedStorage/index.ts';
export { nsfConfigValidation } from './nsfConfigValidation.ts';
export {
  OTelPerformanceManager,
  type PerformanceManager,
} from './PerformanceManager/index.ts';
export { throttle } from './throttle.ts';
export type { TimeoutRef } from './timeout/index.ts';
export { withErrorFallback } from './withErrorFallback.ts';
