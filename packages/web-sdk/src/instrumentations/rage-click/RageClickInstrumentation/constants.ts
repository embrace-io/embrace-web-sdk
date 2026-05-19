// Minimum number of clicks to register a rage click
export const RAGE_CLICK_THRESHOLD = 3;

// Maximum time (in ms) to register consecutive clicks
export const RAGE_CLICK_WINDOW_TIME = 500;

// Consecutive clicks must be within this radius (in pixels) to be considered part
// of the same rage click sequence. This radius is ignored if the clicks are
// registered on the same target.
export const RAGE_CLICK_RADIUS = 50;

export const RAGE_CLICK_EVENT_NAME = 'rage-click';
export const ATTR_RAGE_CLICK_ELEMENT_TYPE = 'rage_click.element_type';
export const ATTR_RAGE_CLICK_ELEMENT_SELECTOR = 'rage_click.element_selector';
export const ATTR_RAGE_CLICK_X = 'rage_click.x';
export const ATTR_RAGE_CLICK_Y = 'rage_click.y';
export const ATTR_RAGE_CLICK_COUNT = 'rage_click.count';
export const ATTR_RAGE_CLICK_INTERACTION_TYPE = 'rage_click.interaction_type';

export type InteractionType = 'click' | 'tap';
