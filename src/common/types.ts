import type { sdk, session, log, trace, user } from '../index.js';

// Useful for testing so that we can pass in a document-like object and change its visibilityState
export interface VisibilityStateDocument {
  visibilityState: DocumentVisibilityState;
}

// Useful for testing so that we can pass in a document-like object and change its URL
export interface URLDocument {
  URL: string;
}

// Useful for testing so that we can pass in a location-like object and change its pathname
export interface PathnameDocument {
  pathname: string;
}

export interface AttributeScrubber {
  key: string;
  scrub: (value: string) => string;
}

/**
 * Interface for the Embrace Web SDK as expected on the window object.
 */
export type QueuedCall = {
  path: string[];
  args: unknown[];
};

export interface EmbraceWebSdk {
  sdk: typeof sdk;
  session: typeof session;
  log: typeof log;
  trace: typeof trace;
  user: typeof user;
  // [key: string]: unknown;
  // queued calls requested before the SDK is loaded
  __q?: QueuedCall[];
  __isProxy?: boolean;
}

/**
 * Extends the Window interface to include EmbraceWebSdk.
 */
declare global {
  interface Window {
    EmbraceWebSdk?: EmbraceWebSdk;
  }
}
