// Exposes all react specific instrumentation in a way that it is easy to tree-shake. Eventually this should be replaced by its own package.
import { createReactRouterBrowserHistoryInstrumentation } from '../instrumentations/navigation/NavigationInstrumentation/react/createReactRouterBrowserHistoryInstrumentation/index.js';

export { createReactRouterBrowserHistoryInstrumentation };
