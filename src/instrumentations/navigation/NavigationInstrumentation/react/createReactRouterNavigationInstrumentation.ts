import type { NavigationInstrumentationArgs } from '../index.ts';
import { getNavigationInstrumentation } from '../index.ts';

export const createReactRouterNavigationInstrumentation = (
  config: NavigationInstrumentationArgs = {},
) => getNavigationInstrumentation(config);
