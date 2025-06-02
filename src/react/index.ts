// Exposes all react specific instrumentation in a way that it is easy to tree-shake. Eventually this should be replaced by its own package.
import {
  createReactRouterLegacyNavigationInstrumentation,
  withEmbraceRoutingLegacy,
} from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV5/index.js';
import {
  createReactRouterDeclarativeNavigationInstrumentation,
  withEmbraceRouting,
} from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV6Declarative/index.js';
import {
  createReactRouterDataNavigationInstrumentation,
  listenToRouterChanges,
} from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV6Data/index.js';
// We don't want to expose React instrumentation in ../instrumentations/index.js
// eslint-disable-next-line regex/invalid
import { EmbraceErrorBoundary } from '../instrumentations/exceptions/react/EmbraceErrorBoundary/index.js';

export {
  createReactRouterLegacyNavigationInstrumentation,
  withEmbraceRoutingLegacy,
  createReactRouterDeclarativeNavigationInstrumentation,
  withEmbraceRouting,
  createReactRouterDataNavigationInstrumentation,
  listenToRouterChanges,
  EmbraceErrorBoundary,
};
