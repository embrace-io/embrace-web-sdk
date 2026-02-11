import { NavigationInstrumentation } from './NavigationInstrumentation.ts';
import type { NavigationInstrumentationArgs } from './types.ts';

let navigationInstrumentation: NavigationInstrumentation | undefined;

export const getNavigationInstrumentation = (
  config: NavigationInstrumentationArgs = {},
): NavigationInstrumentation => {
  if (!navigationInstrumentation) {
    navigationInstrumentation = new NavigationInstrumentation(config);
  }

  return navigationInstrumentation;
};
