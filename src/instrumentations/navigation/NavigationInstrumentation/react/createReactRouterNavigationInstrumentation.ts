import type { NavigationInstrumentationArgs } from '../index.js';
import { getNavigationInstrumentation } from '../index.js';

export const createReactRouterNavigationInstrumentation = (
  config: NavigationInstrumentationArgs = {}
) => getNavigationInstrumentation(config);
