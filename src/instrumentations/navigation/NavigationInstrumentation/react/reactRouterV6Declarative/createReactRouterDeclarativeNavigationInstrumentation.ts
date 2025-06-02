import {
  getNavigationInstrumentation,
  type NavigationInstrumentationArgs,
} from '../../index.js';

export const createReactRouterDeclarativeNavigationInstrumentation = (
  config: NavigationInstrumentationArgs = {}
) => getNavigationInstrumentation(config);
