import {
  getNavigationInstrumentation,
  type NavigationInstrumentationArgs,
} from '../../index.js';

export const createReactRouterV6DeclarativeNavigationInstrumentation = (
  config: NavigationInstrumentationArgs = {}
) => getNavigationInstrumentation(config);
