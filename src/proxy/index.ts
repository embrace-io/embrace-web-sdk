// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck TEMPORARY FOR DEVELOPMENT PURPOSES
import type { EmbraceWebSdk, QueuedCall } from '../common/index.js';

/**
 * Internal state for queued calls and SDK readiness.
 */
const queuedCalls: QueuedCall[] = [];
let realSdk: EmbraceWebSdk | undefined = undefined;
let sdkLoaded = false;

/**
 * Promise that resolves when the SDK is loaded and ready.
 */
let sdkReadyResolve: (() => void) | null = null;
let sdkReadyReject: ((err: Error) => void) | null = null;
const sdkReady: Promise<void> = new Promise((resolve, reject) => {
  sdkReadyResolve = resolve;
  sdkReadyReject = reject;
});

/**
 * Utility to get a nested property/function from an object using a path array.
 */
const getTarget = (obj: unknown, path: string[]): unknown => {
  let current: unknown = obj;
  for (let i = 0; i < path.length; i++) {
    if (typeof current !== 'object' || current === null) return undefined;
    // Use index signature for dynamic access
    current = (current as Record<string, unknown>)[path[i]];
  }
  return current;
};

/**
 * Creates a Proxy for a given SDK namespace, supporting property access and function calls.
 * @param name The root SDK namespace (e.g., 'sdk', 'session')
 * @param path The property path within the namespace
 */
const createProxy = (name: string, path: string[] = []): unknown =>
  new Proxy(() => {}, {
    get: (_t, prop) => {
      if (typeof prop !== 'string') {
        return undefined;
      }
      if (
        sdkLoaded &&
        realSdk &&
        typeof realSdk[name] === 'object' &&
        realSdk[name] !== null
      ) {
        // Use index signature for dynamic access
        return (realSdk[name] as Record<string, unknown>)[prop];
      }
      return createProxy(name, [...path, prop]);
    },
    apply: (_t, _thisArg, args: unknown[]) => {
      if (
        sdkLoaded &&
        realSdk &&
        typeof realSdk[name] === 'object' &&
        realSdk[name] !== null
      ) {
        const fn = getTarget(realSdk[name] as Record<string, unknown>, path);
        if (typeof fn === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
          return fn(...args);
        }
        return undefined;
      }
      queuedCalls.push({ path: [name, ...path], args });
      return undefined;
    },
  });

/**
 * Proxies for each SDK namespace.
 */
const sdkProxy = createProxy('sdk');
const sessionProxy = createProxy('session');
const logProxy = createProxy('log');
const traceProxy = createProxy('trace');
const userProxy = createProxy('user');

/**
 * Loads the Embrace Web SDK from a CDN URL, assigns it to the internal state,
 * and replays any queued calls. Returns a promise that resolves when ready.
 * @param cdnUrl The CDN URL to import the SDK from
 */
const loadSdk = async (cdnUrl: string): Promise<void> => {
  if (sdkLoaded) return; // Prevent double-loading

  try {
    await import(cdnUrl);

    const sdkFromWindow = window.EmbraceWebSdk;
    if (!sdkFromWindow) {
      const err = new Error('EmbraceWebSdk not found on window after import.');
      if (sdkReadyReject) sdkReadyReject(err);
      throw err;
    }

    realSdk = sdkFromWindow;
    sdkLoaded = true;

    // Replay queued calls in order, only once
    for (const call of queuedCalls) {
      const fn = getTarget(realSdk, call.path);
      if (typeof fn === 'function') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          fn(...call.args);
        } catch {
          // Optionally log or handle errors for individual calls
        }
      }
    }
    queuedCalls.length = 0;

    if (sdkReadyResolve) sdkReadyResolve();
  } catch (err) {
    if (sdkReadyReject) sdkReadyReject(err as Error);
    throw err;
  }
};

/**
 * Export proxies and the loadSdk function.
 * Consumers can use the proxies before or after the SDK is loaded.
 * The sdkReady promise can be awaited for readiness.
 */
export {
  sdkProxy as sdk,
  sessionProxy as session,
  logProxy as log,
  traceProxy as trace,
  userProxy as user,
  loadSdk,
  sdkReady,
};
