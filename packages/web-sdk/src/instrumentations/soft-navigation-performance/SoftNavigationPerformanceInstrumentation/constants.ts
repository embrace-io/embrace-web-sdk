export const SOFT_NAVIGATION_SPAN_NAME = 'Soft Navigation';

export const KEY_EMB_SOFT_NAVIGATION_SOURCE = 'emb.soft_navigation.source';
export const KEY_EMB_SOFT_NAVIGATION_NAVIGATION_ID =
  'emb.soft_navigation.navigation_id';
export const KEY_EMB_SOFT_NAVIGATION_INTERACTION_ID =
  'emb.soft_navigation.interaction_id';
export const KEY_EMB_SOFT_NAVIGATION_START_TIME =
  'emb.soft_navigation.start_time';
export const KEY_EMB_SOFT_NAVIGATION_DURATION = 'emb.soft_navigation.duration';
export const KEY_EMB_SOFT_NAVIGATION_PAINT_TIME =
  'emb.soft_navigation.paint_time';
export const KEY_EMB_SOFT_NAVIGATION_PRESENTATION_TIME =
  'emb.soft_navigation.presentation_time';
export const KEY_EMB_SOFT_NAVIGATION_SPAN_IDS = 'emb.soft_navigation.span_ids';
export const KEY_EMB_SOFT_NAVIGATION_LOG_IDS = 'emb.soft_navigation.log_ids';
// Parallel arrays to span_ids/log_ids: the emb.type of the id at the same
// index, so the backend knows which table to look the id up in.
export const KEY_EMB_SOFT_NAVIGATION_SPAN_ID_TYPES =
  'emb.soft_navigation.span_id_types';
export const KEY_EMB_SOFT_NAVIGATION_LOG_ID_TYPES =
  'emb.soft_navigation.log_id_types';

export const SOFT_NAVIGATION_SOURCES = {
  performanceObserver: 'performance_observer',
  polyfill: 'polyfill',
} as const;
