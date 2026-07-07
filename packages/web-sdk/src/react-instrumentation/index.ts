// Exposes React-specific instrumentation in a way that is easy to tree-shake.
// Eventually this should be replaced by its own package.
//
// The React Router navigation helpers are deprecated no-ops: navigation is now
// captured out of the box via soft navigation, and templated route names are
// configured with `initSDK({ routes: [...] })`. EmbraceErrorBoundary remains
// fully functional.

import type { ComponentType } from 'react';
import { EmbraceErrorBoundary } from '../instrumentations/exceptions/react/EmbraceErrorBoundary/index.ts';
import { getNavigationInstrumentation } from '../instrumentations/index.ts';

/**
 * @deprecated No-op. Configure route templates with
 * `initSDK({ routes: [...] })`.
 */
export const createReactRouterNavigationInstrumentation = (
  _config?: unknown,
): ReturnType<typeof getNavigationInstrumentation> =>
  getNavigationInstrumentation();

/**
 * @deprecated No-op. Returns the component unchanged. Configure route templates
 * with `initSDK({ routes: [...] })`.
 */
export const withEmbraceRouting = <P extends object>(
  WrappedComponent: ComponentType<P>,
): ComponentType<P> => WrappedComponent;

/**
 * @deprecated No-op. Returns the component unchanged. Configure route templates
 * with `initSDK({ routes: [...] })`.
 */
export const withEmbraceRoutingLegacy = <P extends object>(
  WrappedComponent: ComponentType<P>,
): ComponentType<P> => WrappedComponent;

/**
 * @deprecated No-op. Returns a no-op unsubscribe. Configure route templates with
 * `initSDK({ routes: [...] })`.
 */
export const listenToRouterChanges =
  (_args?: unknown): (() => void) =>
  () => {
    // no-op
  };

export { EmbraceErrorBoundary };
