import {
  getNavigationInstrumentation,
  type NavigationInstrumentationArgs,
} from '../../index.js';

export const createReactRouterLegacyNavigationInstrumentation = (
  config: NavigationInstrumentationArgs = {}
) => getNavigationInstrumentation(config);
