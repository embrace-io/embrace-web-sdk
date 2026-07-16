import type {
  Instrumentation,
  InstrumentationConfig,
} from '@opentelemetry/instrumentation';
import type { NavigationInstrumentationArgs } from '../index.ts';

/**
 * @deprecated Will be removed in a future version. No-op: soft navigations
 * are captured out of the box, so NavigationInstrumentation no longer needs
 * to be constructed manually. For templated route names, use
 * `withEmbraceRouting`, `withEmbraceRoutingLegacy`, or
 * `listenToRouterChanges` instead. Returns an inert instrumentation so
 * existing `instrumentations: [createReactRouterNavigationInstrumentation()]`
 * setups keep working.
 */
export const createReactRouterNavigationInstrumentation = (
  _config: NavigationInstrumentationArgs = {},
): Instrumentation => ({
  instrumentationName: 'NavigationInstrumentation',
  instrumentationVersion: '1.0.0',
  disable: () => {},
  enable: () => {},
  setTracerProvider: () => {},
  setMeterProvider: () => {},
  setConfig: () => {},
  getConfig: (): InstrumentationConfig => ({}),
});
