const KEY_EMB_TYPE = 'emb.type';
const KEY_EMB_STATE = 'emb.state';
// TODO: update once we have the right type
const KEY_JS_EXCEPTION = 'emb.android.react_native_crash.js_exception';

enum EMB_TYPES {
  Session = 'ux.session',
  Network = 'perf.network_request',
  // TODO: update once we have the right type
  Exception = 'sys.android.react_native_crash',
  // todo update once we support a new type specific to web RUM
  WebViewInfo = 'sys.webview_info',
}

enum EMB_STATES {
  Foreground = 'foreground',
  Background = 'background',
}

export {KEY_EMB_TYPE, KEY_EMB_STATE, EMB_TYPES, EMB_STATES, KEY_JS_EXCEPTION};
