/** 30 minutes */
export const TIMEOUT_TIME = 30 * 60 * 1000; // half an hour in milis = 1.800.000 milis
/** 30 seconds */
export const EVENT_THROTTLING_TIME_WINDOW = 30 * 1000; // 30 seconds in milis = 30.000 milis
export const WINDOW_USER_EVENTS = [
  'resize',
  'copy',
  'cut',
  'paste',
  'focus',
  'afterprint',
  'beforeprint',
  'scrollsnapchange',
  'auxclick',
  'click',
  'dblclick',
  'drag',
  'dragend',
  'dragenter',
  'drageleave',
  'dragover',
  'dragstart',
  'drop',
  'keydown',
  'keyup',
  'keypress',
  'mousedown',
  'mouseenter',
  'mouseleave',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
]; // list manually generated from the user related event in https://developer.mozilla.org/en-US/docs/Web/API/Window#events, updated on 2025-02-24
