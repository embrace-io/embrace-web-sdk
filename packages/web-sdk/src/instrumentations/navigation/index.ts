import { NoOpNavigationInstrumentation } from './NoOpNavigationInstrumentation.ts';

let navigationInstrumentation: NoOpNavigationInstrumentation | undefined;

/**
 * @deprecated Navigation is captured out of the box via soft navigation.
 * Configure templated route names with `initSDK({ routes: [...] })`.
 * Returns a no-op instrumentation for backwards compatibility.
 */
export const getNavigationInstrumentation = (
  _config?: unknown,
): NoOpNavigationInstrumentation => {
  if (!navigationInstrumentation) {
    navigationInstrumentation = new NoOpNavigationInstrumentation();
  }

  return navigationInstrumentation;
};

export { NoOpNavigationInstrumentation };
