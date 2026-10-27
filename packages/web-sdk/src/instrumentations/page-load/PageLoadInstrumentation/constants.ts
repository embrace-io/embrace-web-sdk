export const PAGE_LOAD_EVENT_NAME = 'page-load';
export const ATTR_PAGE_LOAD_TYPE = 'page_load.type';
export const ATTR_PAGE_LOAD_DURATION = 'page_load.duration';

// How long the page must go without network or DOM activity to count as loaded.
export const PAGE_LOAD_QUIET_WINDOW_MS = 100;

export type PageLoadType = 'initial_load' | 'route_change';
