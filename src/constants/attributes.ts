export const KEY_EMB_TYPE = 'emb.type';
export const KEY_EMB_STATE = 'emb.state';
export const KEY_EMB_SESSION_REASON_ENDED = 'emb.session_end_type';
export const KEY_JS_EXCEPTION_STACKTRACE = 'emb.stacktrace.js';

export enum EMB_TYPES {
  Session = 'ux.session',
  Network = 'perf.network_request',
  // SystemLog = 'sys.log', is a log emb type that tells the Embrace BE to treat this as an Embrace Log to be shown in the dashboard.
  SystemLog = 'sys.log',
  WebVital = 'ux.web_vital'
}

export enum EMB_STATES {
  Foreground = 'foreground'
}
