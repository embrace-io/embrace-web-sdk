const DEFAULT_CONCURRENCY = 5; // chrome supports 10 total, firefox 17
const DEFAULT_EMBRACE_EXPORTER_CONFIG = {
  compression: 'gzip' as const,
  keepalive: true,
  concurrencyLimit: DEFAULT_CONCURRENCY,
  timeoutMillis: 30 * 1000,
};
const EMBRACE_DATA_URL =
  'https://data.websdk3.pablomatiasgomez.dev.emb-eng.com/v2/spans';
const EMBRACE_TRACE_ENDPOINT = `${EMBRACE_DATA_URL}/v2/span`;
const EMBRACE_LOG_ENDPOINT = `${EMBRACE_DATA_URL}/v2/logs`;

export {
  DEFAULT_CONCURRENCY,
  DEFAULT_EMBRACE_EXPORTER_CONFIG,
  EMBRACE_TRACE_ENDPOINT,
  EMBRACE_LOG_ENDPOINT,
};
