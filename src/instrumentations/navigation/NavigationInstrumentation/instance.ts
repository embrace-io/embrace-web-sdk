import { NavigationInstrumentation } from './NavigationInstrumentation.js';
import type { NavigationInstrumentationArgs } from './types.js';

let navigationInstrumentation: NavigationInstrumentation | undefined;

export const getNavigationInstrumentation = (
  config: NavigationInstrumentationArgs = {},
): NavigationInstrumentation => {
  if (!navigationInstrumentation) {
    navigationInstrumentation = new NavigationInstrumentation(config);
  }

  return navigationInstrumentation;
};
