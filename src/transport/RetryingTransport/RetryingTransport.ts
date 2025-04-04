import type {
  ExportResponse,
  IExporterTransport,
} from '@opentelemetry/otlp-exporter-base';
import type { PerformanceManager } from '../../utils/index.js';
import { OTelPerformanceManager } from '../../utils/index.js';
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
const getJitter = () => Math.random() * (2 * JITTER) - JITTER;

// Taken directly from open-telemetry/opentelemetry-js/experimental/packages/otlp-exporter-base/src/retrying-transport.ts
// File is not exposed externally

/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export class RetryingTransport implements IExporterTransport {
  public constructor(
    private readonly _transport: IExporterTransport,
    private readonly _perf: PerformanceManager = new OTelPerformanceManager()
  ) {}

  public async send(
    data: Uint8Array,
    timeoutMillis: number
  ): Promise<ExportResponse> {
    const deadline = this._perf.getNowMillis() + timeoutMillis;
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
      const remainingTimeoutMillis = deadline - this._perf.getNowMillis();
      if (retryInMillis > remainingTimeoutMillis) {
        return result;
      }

      result = await this._retry(data, remainingTimeoutMillis, retryInMillis);
    }

    return result;
  }

  public shutdown() {
    this._transport.shutdown();
  }

  private _retry(
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
