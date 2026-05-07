export { bulkAddEventListener } from './bulkAddEventListener/index.ts';
export { bulkRemoveEventListener } from './bulkRemoveEventListener/index.ts';
export { clampNumber } from './clampNumber.ts';
export { createSafeProxy } from './createSafeProxy/index.ts';
export { generateUUID } from './generateUUID.ts';
export { generateWebVitalID } from './generateWebVitalID.ts';
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
export {
  createPerformanceObserver,
  isEntryTypeSupported,
} from './performanceObserver/index.ts';
export {
  installSoftNavigationObserver,
  SOFT_NAVIGATION_ENTRY_TYPE,
  type SoftNavigationObserverOptions,
  type SoftNavigationPerformanceEntry,
} from './softNavigationObserver/index.ts';
export { throttle } from './throttle.ts';
export type { TimeoutRef } from './timeout/index.ts';
