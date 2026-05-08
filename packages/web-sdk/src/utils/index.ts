export {
  applyUserSessionAttributesToSpan,
  createUserSessionAttributes,
} from './applyUserSessionAttributes.ts';
export { bulkAddEventListener } from './bulkAddEventListener/index.ts';
export { bulkRemoveEventListener } from './bulkRemoveEventListener/index.ts';
export { createSafeProxy } from './createSafeProxy/index.ts';
export { EmbraceStorage } from './EmbraceStorage/index.ts';
export { generateUUID } from './generateUUID.ts';
export { generateWebVitalID } from './generateWebVitalID.ts';
export { getIncrementedCount } from './getIncrementedCount.ts';
export { getVisibilityState } from './getVisibilityState.ts';
export { GLOBAL_CONFIG } from './globalConfig.ts';
export { isDeviceIdEnabled } from './isDeviceIdEnabled.ts';
export { nsfConfigValidation } from './nsfConfigValidation.ts';
export {
  OTelPerformanceManager,
  type PerformanceManager,
} from './PerformanceManager/index.ts';
export {
  createPerformanceObserver,
  isEntryTypeSupported,
} from './performanceObserver/index.ts';
export { throttle } from './throttle.ts';
export type { TimeoutRef } from './timeout/index.ts';
