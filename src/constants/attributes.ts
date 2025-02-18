export const KEY_EMB_TYPE = 'emb.type';
export const KEY_EMB_STATE = 'emb.state';
export const KEY_JS_EXCEPTION_STACKTRACE = 'emb.stacktrace.js';

export enum EMB_TYPES {
  Session = 'ux.session',
  Network = 'perf.network_request',
  // SystemLog = 'sys.log', is an log emb type that tells the Embrace BE to process and keep the log.
  // Our SDK adds it to any log generated through Embrace SDK.
  SystemLog = 'sys.log',
  WebVital = 'ux.web_vital',
}

export enum EMB_STATES {
  Foreground = 'foreground',
  Background = 'background',
}
