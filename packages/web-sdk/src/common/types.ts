// Useful for testing so that we can pass in a document-like object and change its visibilityState
export interface VisibilityStateDocument {
  visibilityState: DocumentVisibilityState;
  hasFocus: () => boolean;
  // Optional so test fakes that only need visibilityState/hasFocus stay
  // valid. The real `window.document` always provides these; consumers
  // that depend on document-level events (e.g., the session manager
  // listening for `visibilitychange`) guard with optional chaining.
  readyState?: DocumentReadyState;
  addEventListener?: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ) => void;
  removeEventListener?: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: EventListenerOptions | boolean,
  ) => void;
}

// Minimal shape of NavigationCurrentEntryChangeEvent (Navigation API, not yet in TypeScript's DOM lib).
// `from` is optional so test fakes that dispatch a plain Event remain valid.
export interface SoftNavigationEvent extends Event {
  readonly from: { url: string };
}

// Minimal shape of window.navigation (Navigation API, not yet in TypeScript's DOM lib).
export interface Navigation {
  addEventListener(
    type: 'currententrychange',
    listener: (event: SoftNavigationEvent) => void,
  ): void;
  removeEventListener(
    type: 'currententrychange',
    listener: (event: SoftNavigationEvent) => void,
  ): void;
}

// Useful for testing so that we can pass in a window-like object for soft-navigation detection
export interface NavigationHost {
  navigation?: Navigation;
  location: { href: string };
}

// Useful for testing so that we can pass in a document-like object and change its URL
export interface URLDocument {
  URL: string;
}

// Useful for testing so that we can pass in a location-like object and change its pathname
export interface PathnameDocument {
  pathname: string;
}

// Useful for testing so that we can pass in a document-like object and change its title
export interface TitleDocument {
  title: string;
}

export interface AttributeScrubber {
  key: string;
  scrub: (value: string) => string;
}
