export const KEY_EMB_TYPE = 'emb.type';
export const KEY_EMB_STATE = 'emb.state';
export const KEY_EMB_COLD_START = 'emb.cold_start';
export const KEY_EMB_SESSION_NUMBER = 'emb.session_number';
export const KEY_EMB_EXCEPTION_NUMBER = 'emb.exception_number';
export const KEY_EMB_SDK_STARTUP_DURATION = 'emb.sdk_startup_duration';
export const KEY_PREFIX_EMB_PROPERTIES = 'emb.properties.';
export const KEY_EMB_SESSION_REASON_ENDED = 'emb.session_end_type';
export const KEY_EMB_SESSION_REASON_STARTED = 'emb.session_start_type';
export const KEY_EMB_JS_EXCEPTION_STACKTRACE = 'emb.stacktrace.js';
export const KEY_EMB_EXCEPTION_HANDLING = 'emb.exception_handling';
export const KEY_EMB_EXCEPTION_CAUSE = 'emb.exception_cause';
export const KEY_EMB_ERROR_CODE = 'emb.error_code';
export const KEY_EMB_APP_INSTANCE_ID = 'emb.app_instance_id';
export const KEY_EMB_TAB_ID = 'emb.tab_id';
export const KEY_EMB_SOURCE_TAB_ID = 'emb.source_tab_id';
export const KEY_EMB_ERROR_LOG_COUNT = 'emb.error_log_count';
export const KEY_EMB_INSTRUMENTATION = 'emb.instrumentation';
export const KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT =
  'emb.unhandled_exceptions_count';
export const KEY_EMB_FROM_STORAGE = 'emb.from_storage';
export const KEY_EMB_JS_FILE_BUNDLE_IDS = 'emb.js_file_bundle_ids';
export const KEY_EMB_W3C_TRACEPARENT = 'emb.w3c_traceparent';
export const KEY_EMB_NAVIGATION_SOURCE = 'emb.navigation_source';
export const KEY_EMB_REFERRER_URL = 'emb.referrer_url';
export const KEY_BROWSER_URL_FULL = 'browser.url.full';
export const KEY_EMB_MAX_PENDING_SPANS_REACHED =
  'emb.max_pending_spans_reached';
// In the backend we use 'app.surface.name' and 'app.surface.id' for the page name and id
// to be consistent with mobile where we use 'app.surface.*' for screen names and ids
export const KEY_EMB_PAGE_PATH = 'app.surface.name';
export const KEY_EMB_PAGE_ID = 'app.surface.id';
export const KEY_APP_SURFACE_LABEL = 'app.surface.label';

export enum EMB_TYPES {
  Session = 'ux.session',
  Network = 'perf.network_request',
  Perf = 'perf',
  SystemLog = 'sys.log', // SystemLog is a log emb type that tells the Embrace BE to treat this as an Embrace Log to be shown in the dashboard.
  SystemException = 'sys.exception',
  WebVital = 'ux.web_vital',
  LoafScripts = 'ux.loaf_scripts',
  ResourceFetch = 'ux.resource_fetch',
  DocumentLoad = 'ux.document_load',
  Surface = 'ux.surface',
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

export type EMB_INSTRUMENTATIONS =
  | EMB_NAVIGATION_INSTRUMENTATIONS
  | EMB_ERROR_INSTRUMENTATIONS;
