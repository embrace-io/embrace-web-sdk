// biome-ignore-all lint/performance/noBarrelFile: public "./react-instrumentation" entry point.
// Exposes all React-specific instrumentation in a way that is easy to tree-shake. Eventually this should be replaced by its own package.

import { EmbraceErrorBoundary } from '../instrumentations/exceptions/react/EmbraceErrorBoundary/EmbraceErrorBoundary.ts';
import { createReactRouterNavigationInstrumentation } from '../instrumentations/navigation/NavigationInstrumentation/react/createReactRouterNavigationInstrumentation.ts';
import { withEmbraceRoutingLegacy } from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV5/withEmbraceRoutingLegacy.ts';
import { listenToRouterChanges } from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV6Data/listenToRouterChanges.ts';
import { withEmbraceRouting } from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV6Declarative/withEmbraceRouting.ts';

export {
  createReactRouterNavigationInstrumentation,
  EmbraceErrorBoundary,
  listenToRouterChanges,
  withEmbraceRouting,
  withEmbraceRoutingLegacy,
};
