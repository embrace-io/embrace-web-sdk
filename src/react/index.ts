// Exposes all react specific instrumentation in a way that it is easy to tree-shake. Eventually this should be replaced by its own package.
import {
  createReactRouterNavigationInstrumentation,
  withEmbraceRouting,
} from '../instrumentations/navigation/NavigationInstrumentation/react/reactRouterV5/index.js';

export { createReactRouterNavigationInstrumentation, withEmbraceRouting };
