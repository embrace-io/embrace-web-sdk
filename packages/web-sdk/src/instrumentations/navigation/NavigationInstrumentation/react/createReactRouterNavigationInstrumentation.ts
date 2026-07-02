import { getNavigationInstrumentation } from '../instance.ts';
import type { NavigationInstrumentationArgs } from '../types.ts';

export const createReactRouterNavigationInstrumentation = (
  config: NavigationInstrumentationArgs = {},
) => getNavigationInstrumentation(config);
