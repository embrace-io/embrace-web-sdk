export { bulkAddEventListener } from './bulkAddEventListener/index.ts';
export { bulkRemoveEventListener } from './bulkRemoveEventListener/index.ts';
export { clampNumber } from './clampNumber.ts';
export { createSafeProxy } from './createSafeProxy/index.ts';
export { generateUUID } from './generateUUID.ts';
export { generateWebVitalID } from './generateWebVitalID.ts';
export { getBfcacheNotRestoredReasons } from './getBfcacheNotRestoredReasons.ts';
export { getIncrementedCount } from './getIncrementedCount.ts';
export {
  type EmbracePerformanceNavigationTiming,
  getNonBaselineNavigationTiming,
} from './getNonBaselineNavigationTiming.ts';
export { getSelector } from './getSelector.ts';
export { getVisibilityState } from './getVisibilityState.ts';
export { GLOBAL_CONFIG } from './globalConfig.ts';
export { isDeviceIdEnabled } from './isDeviceIdEnabled.ts';
export {
  type DocumentMeasurement,
  measureDocument,
} from './measureDocument.ts';
export { NamespacedStorage } from './NamespacedStorage/index.ts';
export { nsfConfigValidation } from './nsfConfigValidation.ts';
export {
  OTelPerformanceManager,
  type PerformanceManager,
  updateZeroTimeMillis,
} from './PerformanceManager/index.ts';
export {
  createPerformanceObserver,
  isEntryTypeSupported,
} from './performanceObserver/index.ts';
export {
  isNetworkSpan,
  isSessionPartSpan,
  isSoftNavigationSpan,
  type NetworkSpan,
} from './spanPredicates.ts';
export { throttle } from './throttle.ts';
export type { TimeoutRef } from './timeout/index.ts';
