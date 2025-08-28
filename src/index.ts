import { log } from './api-logs/index.js';
import { session } from './api-sessions/index.js';
import type { ExtendedSpan } from './api-traces/index.js';
import { trace } from './api-traces/index.js';
import { user } from './api-users/index.js';
import { getNavigationInstrumentation } from './instrumentations/index.js';
import type { DynamicConfigManager, DynamicSDKConfig } from './sdk/index.js';
import type { Span } from '@opentelemetry/api';
import { DiagLogLevel } from '@opentelemetry/api';
import { initSDK } from './sdk/index.js';

export {
  getNavigationInstrumentation,
  log,
  initSDK,
  DiagLogLevel,
  session,
  trace,
  user,
};
export type { DynamicConfigManager, DynamicSDKConfig, ExtendedSpan, Span };
