// Exposes all react specific instrumentation in a way that it is easy to tree-shake. Eventually this should be replaced by its own package.
import {
  createReactRouterV5NavigationInstrumentation,
  withEmbraceRoutingLegacy,
} from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV5/index.js';
import {
  createReactRouterV6DeclarativeNavigationInstrumentation,
  withEmbraceRouting,
} from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV6Declarative/index.js';
// We don't want to expose React instrumentation in ../instrumentations/index.js
// eslint-disable-next-line regex/invalid
import { EmbraceErrorBoundary } from '../instrumentations/exceptions/react/EmbraceErrorBoundary/index.js';

export {
  createReactRouterV5NavigationInstrumentation,
  withEmbraceRoutingLegacy,
  createReactRouterV6DeclarativeNavigationInstrumentation,
  withEmbraceRouting,
  EmbraceErrorBoundary,
};
