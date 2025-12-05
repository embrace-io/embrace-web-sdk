import type { Span } from '@opentelemetry/api';
import { DiagLogLevel } from '@opentelemetry/api';
import { log } from './api-logs/index.ts';
import { page } from './api-page/index.ts';
import { session } from './api-sessions/index.ts';
import type { ExtendedSpan } from './api-traces/index.ts';
import { trace } from './api-traces/index.ts';
import { user } from './api-users/index.ts';
import { getNavigationInstrumentation } from './instrumentations/index.ts';
import type { DynamicConfigManager, DynamicSDKConfig } from './sdk/index.ts';
import { initSDK } from './sdk/index.ts';

export {
  getNavigationInstrumentation,
  log,
  page,
  initSDK,
  DiagLogLevel,
  session,
  trace,
  user,
};
export type { DynamicConfigManager, DynamicSDKConfig, ExtendedSpan, Span };
