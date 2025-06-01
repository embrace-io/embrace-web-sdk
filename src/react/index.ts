// Exposes all react specific instrumentation in a way that it is easy to tree-shake. Eventually this should be replaced by its own package.
import {
  createReactRouterV5NavigationInstrumentation,
  withEmbraceRoute,
} from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV5/index.js';
import {
  createReactRouterV6DeclarativeNavigationInstrumentation,
  withEmbraceRoutes,
} from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV6Declarative/index.js';

export {
  createReactRouterV5NavigationInstrumentation,
  withEmbraceRoute,
  createReactRouterV6DeclarativeNavigationInstrumentation,
  withEmbraceRoutes,
};
