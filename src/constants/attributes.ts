const KEY_EMB_TYPE = 'emb.type';
// TODO: update once we have the right type
const KEY_JS_EXCEPTION = 'emb.android.react_native_crash.js_exception';

enum EMB_TYPES {
  Session = 'ux.session',
  // TODO: update once we have the right type
  Exception = 'sys.android.react_native_crash',
}

export {KEY_EMB_TYPE, EMB_TYPES, KEY_JS_EXCEPTION};
