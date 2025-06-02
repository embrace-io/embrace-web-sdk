import {
  getNavigationInstrumentation,
  type NavigationInstrumentationArgs,
} from '../../index.js';

export const createReactRouterNavigationInstrumentation = (
  config: NavigationInstrumentationArgs = {}
) => getNavigationInstrumentation(config);
