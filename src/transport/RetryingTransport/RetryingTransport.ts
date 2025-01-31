import {
  ExportResponse,
  IExporterTransport,
} from '@opentelemetry/otlp-exporter-base';
import {
  BACKOFF_MULTIPLIER,
  INITIAL_BACKOFF,
  JITTER,
  MAX_ATTEMPTS,
  MAX_BACKOFF,
} from './constants.js';

/**
 * Get a pseudo-random jitter that falls in the range of [-JITTER, +JITTER]
 */
const getJitter = () => {
  return Math.random() * (2 * JITTER) - JITTER;
};

// Taken directly from open-telemetry/opentelemetry-js/experimental/packages/otlp-exporter-base/src/retrying-transport.ts
// File is not exposed externally
export class RetryingTransport implements IExporterTransport {
  constructor(private _transport: IExporterTransport) {}

  async send(data: Uint8Array, timeoutMillis: number): Promise<ExportResponse> {
    const deadline = Date.now() + timeoutMillis;
    let result = await this._transport.send(data, timeoutMillis);
    let attempts = MAX_ATTEMPTS;
    let nextBackoff = INITIAL_BACKOFF;

    while (result.status === 'retryable' && attempts > 0) {
      attempts--;

      // use maximum of computed backoff and 0 to avoid negative timeouts
      const backoff = Math.max(
        Math.min(nextBackoff, MAX_BACKOFF) + getJitter(),
        0
      );
      nextBackoff = nextBackoff * BACKOFF_MULTIPLIER;
      const retryInMillis = result.retryInMillis ?? backoff;

      // return when expected retry time is after the export deadline.
      const remainingTimeoutMillis = deadline - Date.now();
      if (retryInMillis > remainingTimeoutMillis) {
        return result;
      }

      result = await this.retry(data, remainingTimeoutMillis, retryInMillis);
    }

    return result;
  }

  shutdown() {
    return this._transport.shutdown();
  }

  private retry(
    data: Uint8Array,
    timeoutMillis: number,
    inMillis: number
  ): Promise<ExportResponse> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        this._transport.send(data, timeoutMillis).then(resolve, reject);
      }, inMillis);
    });
  }
}
