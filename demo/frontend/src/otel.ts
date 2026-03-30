import { createReactRouterNavigationInstrumentation } from '@embrace-io/web-sdk/react-instrumentation';
import { setupSDK } from './otel-base.ts';

// Force onscreen rendering to trigger a long animation frame
const start = performance.now();
while (performance.now() - start < 200) {
  // block main thread
}

const setupOTel = () =>
  setupSDK([createReactRouterNavigationInstrumentation()]);

export { setupOTel };
