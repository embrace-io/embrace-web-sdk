export {
  NOT_SAMPLED_UUID,
  SAMPLED_UUID,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from './constants.js';
export { FailingStorage } from './FailingStorage/index.js';
export { FakeInstrumentation } from './FakeInstrumentation/index.js';
export { FakeLogRecordProcessor } from './FakeLogRecordProcessor/index.js';
export { FakeSpanProcessor } from './FakeSpanProcessor/index.js';
export {
  getBody as fakeFetchGetBody,
  getMethod as fakeFetchGetMethod,
  getOptions as fakeFetchGetOptions,
  getRequestHeaders as fakeFetchGetRequestHeaders,
  getUrl as fakeFetchGetUrl,
  install as fakeFetchInstall,
  resetHistory as fakeFetchResetHistory,
  respondWith as fakeFetchRespondWith,
  restore as fakeFetchRestore,
  wasCalled as fakeFetchWasCalled,
} from './fake-fetch/index.js';
export { InMemoryDiagLogger } from './InMemoryDiagLogger/index.js';
export { InMemoryStorage } from './InMemoryStorage/index.js';
export { MockPerformanceManager } from './MockPerformanceManager/index.js';
export { mockSpan } from './mockEntities/index.js';
export { setupTestLogExporter } from './setupTestLogExporter/index.js';
export { setupTestTraceExporter } from './setupTestTraceExporter/index.js';
export { setupTestWebVitalListeners } from './setupTestWebVitalListeners/index.js';
