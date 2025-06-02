import {
  getNavigationInstrumentation,
  type NavigationInstrumentationArgs,
} from '../../index.js';

export const createReactRouterDataNavigationInstrumentation = (
  config: NavigationInstrumentationArgs = {}
) => getNavigationInstrumentation(config);
