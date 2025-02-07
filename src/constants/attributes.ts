export const KEY_EMB_TYPE = 'emb.type';
export const KEY_EMB_STATE = 'emb.state';
// TODO: update once we have the right type
export const KEY_JS_EXCEPTION_STACKTRACE = 'emb.stacktrace.rn';
export const KEY_ENDUSER_PSEUDO_ID = 'enduser.pseudo.id';

export enum EMB_TYPES {
  Session = 'ux.session',
  Network = 'perf.network_request',
  // TODO: update once we have the right type
  SystemLog = 'sys.log',
  // todo update once we support a new type specific to web RUM
  WebViewInfo = 'sys.webview_info',
}

export enum EMB_STATES {
  Foreground = 'foreground',
  Background = 'background',
}
