export {
  getOptions as fakeFetchGetOptions,
  install as fakeFetchInstall,
  restore as fakeFetchRestore,
  getMethod as fakeFetchGetMethod,
  getBody as fakeFetchGetBody,
  getUrl as fakeFetchGetUrl,
  getRequestHeaders as fakeFetchGetRequestHeaders,
  respondWith as fakeFetchRespondWith,
  wasCalled as fakeFetchWasCalled,
} from './fake-fetch/index.js';
export { InMemoryDiagLogger } from './InMemoryDiagLogger/index.js';
export { MockPerformanceManager } from './MockPerformanceManager/index.js';
export { setupTestTraceExporter } from './setupTestTraceExporter/index.js';
export { setupTestLogExporter } from './setupTestLogExporter/index.js';
export { FakeInstrumentation } from './FakeInstrumentation/index.js';
export { FakeLogRecordProcessor } from './FakeLogRecordProcessor/index.js';
export { FakeSpanProcessor } from './FakeSpanProcessor/index.js';
export { setupTestWebVitalListeners } from './setupTestWebVitalListeners/index.js';
export { mockSpan } from './mockEntities/index.js';
export { InMemoryStorage } from './InMemoryStorage/index.js';
