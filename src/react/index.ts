// Exposes all react specific instrumentation in a way that it is easy to tree-shake. Eventually this should be replaced by its own package.
// That's why this rule don't apply here, and it will get fixed once we move this to its own package
/* eslint-disable regex/invalid */
import { withEmbraceRoutingLegacy } from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV5/index.js';
import { withEmbraceRouting } from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV6Declarative/index.js';
import { listenToRouterChanges } from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV6Data/index.js';
import { createReactRouterNavigationInstrumentation } from '../instrumentations/navigation/NavigationInstrumentation/react/createReactRouterNavigationInstrumentation.js';
import { EmbraceErrorBoundary } from '../instrumentations/exceptions/react/EmbraceErrorBoundary/index.js';

export {
  createReactRouterNavigationInstrumentation,
  withEmbraceRoutingLegacy,
  withEmbraceRouting,
  listenToRouterChanges,
  EmbraceErrorBoundary,
};
