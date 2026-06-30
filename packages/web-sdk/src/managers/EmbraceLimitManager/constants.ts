import type { EmbraceLimitManagerArgs } from './types.ts';

export const DEFAULT_MAX_LOG_ATTRIBUTES = 50;

export const DEFAULT_LIMITS: EmbraceLimitManagerArgs = {
  // These are per session limits, the counts of items against these maximums start over when `reset` is called on the
  // limit manager which is done whenever a session ends
  maxAllowed: {
    error_log: 500,
    warning_log: 200,
    info_log: 100,
    exception: 500,
    breadcrumb: 100,
    session_property: 100,
    span: 1_000,
    network_request: 10_000,
    user_timing_mark: 200,
    user_timing_measure: 100,
    element_timing: 100,
    server_timing: 50,
    soft_navigation: 100,
  },
  maxLength: {
    error_log: 128,
    warning_log: 128,
    info_log: 128,
    exception: 1024,
    breadcrumb: 256,
    session_property_key: 128,
    session_property_value: 256,
    log_attribute_key: 128,
    log_attribute_value: 256,
    exception_attribute_key: 128,
    exception_attribute_value: 256,
  },
  maxAttributes: {
    error_log: DEFAULT_MAX_LOG_ATTRIBUTES,
    warning_log: DEFAULT_MAX_LOG_ATTRIBUTES,
    info_log: DEFAULT_MAX_LOG_ATTRIBUTES,
    exception: DEFAULT_MAX_LOG_ATTRIBUTES,
  },
};
