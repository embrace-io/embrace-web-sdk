const DEFAULT_CONCURRENCY = 5; // chrome supports 10 total, firefox 17
export const DEFAULT_EMBRACE_EXPORTER_CONFIG = {
  compression: 'gzip' as const,
  keepalive: true,
  concurrencyLimit: DEFAULT_CONCURRENCY,
  timeoutMillis: 30 * 1000,
};
export const EMBRACE_DATA_URL =
  'https://data.websdk6.pablomatiasgomez.dev.emb-eng.com';
