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
