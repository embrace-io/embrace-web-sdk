export const KEY_EMB_TYPE = 'emb.type';
export const KEY_EMB_STATE = 'emb.state';
export const KEY_EMB_COLD_START = 'emb.cold_start';
export const KEY_EMB_EXCEPTION_NUMBER = 'emb.exception_number';
export const KEY_EMB_SDK_STARTUP_DURATION = 'emb.sdk_startup_duration';
export const KEY_PREFIX_EMB_PROPERTIES = 'emb.properties.';
export const KEY_EMB_JS_EXCEPTION_STACKTRACE = 'emb.stacktrace.js';
export const KEY_EMB_EXCEPTION_HANDLING = 'emb.exception_handling';
export const KEY_EMB_EXCEPTION_CAUSE = 'emb.exception_cause';
export const KEY_EMB_ERROR_CODE = 'emb.error_code';
export const KEY_EMB_APP_INSTANCE_ID = 'emb.app_instance_id';
export const KEY_EMB_ERROR_LOG_COUNT = 'emb.error_log_count';
export const KEY_EMB_INSTRUMENTATION = 'emb.instrumentation';
export const KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT =
  'emb.unhandled_exceptions_count';
export const KEY_EMB_JS_FILE_BUNDLE_IDS = 'emb.js_file_bundle_ids';
export const KEY_EMB_W3C_TRACEPARENT = 'emb.w3c_traceparent';
export const KEY_BROWSER_URL_FULL = 'browser.url.full';
// In the backend we use 'app.surface.name' and 'app.surface.id' for the page name and id
// to be consistent with mobile where we use 'app.surface.*' for screen names and ids
export const KEY_EMB_PAGE_PATH = 'app.surface.name';
export const KEY_EMB_PAGE_ID = 'app.surface.id';
export const KEY_APP_SURFACE_LABEL = 'app.surface.label';

// User session attributes
export const KEY_EMB_SESSION_PART_ID = 'emb.session_part_id';
export const KEY_EMB_SESSION_PART_NUMBER = 'emb.session_part_number';
export const KEY_EMB_SESSION_PART_START_REASON =
  'emb.session_part_start_reason';
export const KEY_EMB_SESSION_PART_END_REASON = 'emb.session_part_end_reason';
export const KEY_EMB_USER_SESSION_ID = 'emb.user_session_id';
export const KEY_EMB_USER_SESSION_PREVIOUS_ID = 'emb.user_session_previous_id';
export const KEY_EMB_USER_SESSION_NUMBER = 'emb.user_session_number';
export const KEY_EMB_USER_SESSION_PART_INDEX = 'emb.user_session_part_index';
export const KEY_EMB_USER_SESSION_START_TS = 'emb.user_session_start_ts';
export const KEY_EMB_IS_FINAL_SESSION_PART = 'emb.is_final_session_part';
export const KEY_EMB_USER_SESSION_TERMINATION_REASON =
  'emb.user_session_termination_reason';
export const KEY_EMB_USER_SESSION_MAX_DURATION_SECONDS =
  'emb.user_session_max_duration_seconds';
export const KEY_EMB_USER_SESSION_INACTIVITY_TIMEOUT_SECONDS =
  'emb.user_session_inactivity_timeout_seconds';
export const KEY_EMB_USER_SESSION_FOREGROUND_INACTIVITY_TIMEOUT_SECONDS =
  'emb.user_session_foreground_inactivity_timeout_seconds';

export enum EMB_TYPES {
  SessionPart = 'ux.session_part',
  Network = 'perf.network_request',
  Perf = 'perf',
  SystemLog = 'sys.log', // SystemLog is a log emb type that tells the Embrace BE to treat this as an Embrace Log to be shown in the dashboard.
  SystemException = 'sys.exception',
  WebVital = 'ux.web_vital',
  LoafScripts = 'ux.loaf_scripts',
  ResourceFetch = 'ux.resource_fetch',
  DocumentLoad = 'ux.document_load',
  Surface = 'ux.surface',
  UserTiming = 'ux.user_timing',
  ElementTiming = 'ux.element_timing',
  ServerTiming = 'ux.server_timing',
  OTelLog = 'emb.otel_log',
}

export enum EMB_STATES {
  Foreground = 'foreground',
  Background = 'background',
}

export enum EMB_NAVIGATION_INSTRUMENTATIONS {
  DeclarativeLegacy = 'react_router_declarative_legacy',
  Declarative = 'react_router_declarative',
  Data = 'react_router_data',
  Manual = 'manual',
}

export enum EMB_ERROR_INSTRUMENTATIONS {
  ReactErrorBoundary = 'react_error_boundary',
}

export enum EMB_PERFORMANCE_INSTRUMENTATIONS {
  UserTiming = 'user_timing',
}

export type EMB_INSTRUMENTATIONS =
  | EMB_NAVIGATION_INSTRUMENTATIONS
  | EMB_ERROR_INSTRUMENTATIONS
  | EMB_PERFORMANCE_INSTRUMENTATIONS;
