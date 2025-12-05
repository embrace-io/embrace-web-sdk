// Exposes all React-specific instrumentation in a way that is easy to tree-shake. Eventually this should be replaced by its own package.

import { EmbraceErrorBoundary } from '../instrumentations/exceptions/react/EmbraceErrorBoundary/index.ts';
import { createReactRouterNavigationInstrumentation } from '../instrumentations/navigation/NavigationInstrumentation/react/createReactRouterNavigationInstrumentation.ts';
import { withEmbraceRoutingLegacy } from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV5/index.ts';
import { listenToRouterChanges } from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV6Data/index.ts';
import { withEmbraceRouting } from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV6Declarative/index.ts';

export {
  createReactRouterNavigationInstrumentation,
  withEmbraceRoutingLegacy,
  withEmbraceRouting,
  listenToRouterChanges,
  EmbraceErrorBoundary,
};
