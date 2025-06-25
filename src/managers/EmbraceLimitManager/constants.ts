import type { EmbraceLimitManagerArgs } from './types.js';

export const DEFAULT_MAX_LOG_ATTRIBUTES = 50;

export const DEFAULT_LIMITS: EmbraceLimitManagerArgs = {
  maxAllowed: {
    error_log: 500,
    warning_log: 200,
    info_log: 100,
    breadcrumb: 100,
    session_property: 100,
    span: 1_000,
    network_request: 10_000,
  },
  maxLength: {
    error_log: 128,
    warning_log: 128,
    info_log: 128,
    breadcrumb: 256,
    session_property: 256,
  },
  maxAttributes: {
    error_log: DEFAULT_MAX_LOG_ATTRIBUTES,
    warning_log: DEFAULT_MAX_LOG_ATTRIBUTES,
    info_log: DEFAULT_MAX_LOG_ATTRIBUTES,
  },
};
