// biome-ignore-all lint/performance/noBarrelFile: public package entry point; aggregates the SDK's public API surface.
export type { Span } from '@opentelemetry/api';
export { DiagLogLevel } from '@opentelemetry/api';
export { log } from './api-logs/logAPI.ts';
export { page } from './api-page/pageAPI.ts';
export { session } from './api-sessions/sessionAPI.ts';
export type { ExtendedSpan } from './api-traces/api/TraceAPI/types.ts';
export { trace } from './api-traces/traceAPI.ts';
export { user } from './api-users/userAPI.ts';
export { attributes } from './common/attributes.ts';
export { getNavigationInstrumentation } from './instrumentations/navigation/NavigationInstrumentation/instance.ts';
export { initSDK } from './sdk/initSDK.ts';
export type { DynamicConfigManager, DynamicSDKConfig } from './sdk/types.ts';
