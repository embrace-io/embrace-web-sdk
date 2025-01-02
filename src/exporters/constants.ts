const DEFAULT_CONCURRENCY = 5; // chrome supports 10 total, firefox 17
const DEFAULT_EMBRACE_EXPORTER_CONFIG = {
  compression: 'gzip' as const,
  keepalive: true,
  concurrencyLimit: DEFAULT_CONCURRENCY,
  timeoutMillis: 30 * 1000,
};
const EMBRACE_DATA_URL = 'http://localhost:7070';
const EMBRACE_TRACE_ENDPOINT = `${EMBRACE_DATA_URL}/v1/traces`;
const EMBRACE_LOG_ENDPOINT = `${EMBRACE_DATA_URL}/v1/logs`;

export {
  DEFAULT_CONCURRENCY,
  DEFAULT_EMBRACE_EXPORTER_CONFIG,
  EMBRACE_TRACE_ENDPOINT,
  EMBRACE_LOG_ENDPOINT,
};
