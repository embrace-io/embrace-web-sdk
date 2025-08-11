import { log } from './api-logs/index.js';
import { session } from './api-sessions/index.js';
import type { ExtendedSpan } from './api-traces/index.js';
import { trace } from './api-traces/index.js';
import { user } from './api-users/index.js';
import {
  DocumentLoadInstrumentation,
  getNavigationInstrumentation,
} from './instrumentations/index.js';
import type {
  DynamicConfigManager,
  DynamicSDKConfig,
  Span,
} from './sdk/index.js';
import * as sdk from './sdk/index.js';

export {
  DocumentLoadInstrumentation,
  getNavigationInstrumentation,
  log,
  sdk,
  session,
  trace,
  user,
};
export type { DynamicConfigManager, DynamicSDKConfig, ExtendedSpan, Span };
