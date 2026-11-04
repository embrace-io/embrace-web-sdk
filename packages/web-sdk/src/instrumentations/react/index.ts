// Its own subpath because it imports react, an optional peer that the core `./instrumentations` entry must not require.

import { EmbraceErrorBoundary } from '../exceptions/react/EmbraceErrorBoundary/index.ts';
import { createReactRouterNavigationInstrumentation } from '../navigation/NavigationInstrumentation/react/createReactRouterNavigationInstrumentation.ts';
import { withEmbraceRoutingLegacy } from '../navigation/NavigationInstrumentation/react/reactRouterV5/index.ts';
import { listenToRouterChanges } from '../navigation/NavigationInstrumentation/react/reactRouterV6Data/index.ts';
import { withEmbraceRouting } from '../navigation/NavigationInstrumentation/react/reactRouterV6Declarative/index.ts';

export {
  createReactRouterNavigationInstrumentation,
  EmbraceErrorBoundary,
  listenToRouterChanges,
  withEmbraceRouting,
  withEmbraceRoutingLegacy,
};
