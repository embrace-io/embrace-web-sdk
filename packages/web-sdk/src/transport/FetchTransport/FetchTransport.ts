import { diag } from '@opentelemetry/api';
import type {
  ExportResponse,
  IExporterTransport,
} from '@opentelemetry/otlp-exporter-base';
import type { FetchRequestParameters } from './types.ts';

// The fetch spec limits inflight keepalive request bodies to 64KiB total per
// page context. We use a conservative budget to leave room for third-party
// scripts that may also use keepalive or sendBeacon.
// https://fetch.spec.whatwg.org/#http-network-or-cache-fetch
const KEEPALIVE_BYTE_BUDGET = 49152; // 48KiB

// Chrome enforces a 9-request concurrent keepalive limit per renderer process.
const MAX_KEEPALIVE_REQUESTS = 9;

let inflightKeepaliveBytes = 0;
let inflightKeepaliveCount = 0;

/** @internal for testing only */
export function _resetKeepaliveTracking(): void {
  inflightKeepaliveBytes = 0;
  inflightKeepaliveCount = 0;
}

export class FetchTransport implements IExporterTransport {
  public constructor(private readonly _config: FetchRequestParameters) {}

  // Embrace endpoints require request bodies to be compressed with gzip
  private static async _compressRequest(
    data: Uint8Array<ArrayBuffer>,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();

    void writer.write(data);
    void writer.close();

    const compressedChunks: Uint8Array[] = [];
    const reader = stream.readable.getReader();

    let done = false;
    while (!done) {
      const result = await reader.read();

      if (result.value) {
        compressedChunks.push(result.value);
      }

      done = result.done;
    }

    const compressedData = new Uint8Array(
      compressedChunks.reduce((acc, chunk) => acc + chunk.length, 0),
    );

    let offset = 0;

    for (const chunk of compressedChunks) {
      compressedData.set(chunk, offset);
      offset += chunk.length;
    }

    return compressedData;
  }

  public send(
    data: Uint8Array<ArrayBuffer>,
    timeoutMillis: number,
  ): Promise<ExportResponse> {
    return this._asyncSend(data, timeoutMillis);
  }

  public shutdown(): void {
    // Intentionally left empty, nothing to do.
  }

  public async _asyncSend(
    data: Uint8Array<ArrayBuffer>,
    timeoutMillis: number,
  ): Promise<ExportResponse> {
    let request = data;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this._config.headers,
    };

    // Use AbortSignal.timeout if available, otherwise fallback to AbortController
    // https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
    let signal: AbortSignal;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if ('timeout' in AbortSignal) {
      // ok to ignore because there is a guard
      // eslint-disable-next-line baseline-js/use-baseline
      signal = AbortSignal.timeout(timeoutMillis);
    } else {
      const controller = new AbortController();
      signal = controller.signal;
      timeoutId = setTimeout(() => {
        controller.abort(new DOMException('TimeoutError', 'TimeoutError'));
      }, timeoutMillis);
    }

    let keepalive = false;

    try {
      if (this._config.compression === 'gzip') {
        try {
          request = await FetchTransport._compressRequest(data);
        } catch (error) {
          const compressError =
            error instanceof Error ? error : new Error(String(error));
          diag.warn(
            `Fetch transport gzip compression failed: ${compressError.message}`,
          );
          return { status: 'failure', error: compressError };
        }
        headers['Content-Encoding'] = 'gzip';
        headers['Content-Length'] = request.length.toString();
      }

      const wouldExceedBytes =
        inflightKeepaliveBytes + request.byteLength > KEEPALIVE_BYTE_BUDGET;
      const wouldExceedCount = inflightKeepaliveCount >= MAX_KEEPALIVE_REQUESTS;
      keepalive = !wouldExceedBytes && !wouldExceedCount;

      if (keepalive) {
        inflightKeepaliveBytes += request.byteLength;
        inflightKeepaliveCount++;
      } else {
        const reason = wouldExceedBytes
          ? `inflight bytes (${inflightKeepaliveBytes} + ${request.byteLength}) would exceed ${KEEPALIVE_BYTE_BUDGET}B budget`
          : `concurrent count (${inflightKeepaliveCount}) at limit of ${MAX_KEEPALIVE_REQUESTS}`;
        diag.debug(`Sending without keepalive: ${reason}`);
      }

      const response = await fetch(this._config.url, {
        method: 'POST',
        keepalive,
        headers,
        body: request,
        signal,
      });

      if (response.ok) {
        return { status: 'success' };
      }

      const error = new Error(`${response.status} Fetch request failed`);
      const message = `Fetch transport received HTTP ${response.status} (keepalive=${keepalive})`;
      if (response.status >= 500) {
        diag.debug(message);
        return { status: 'retryable', error };
      }
      diag.warn(message);
      return { status: 'failure', error };
    } catch (error) {
      const fetchError =
        error instanceof Error ? error : new Error(String(error));
      const isRetryable =
        fetchError instanceof TypeError ||
        (fetchError instanceof DOMException &&
          fetchError.name === 'TimeoutError');
      const message = `Fetch transport failed (keepalive=${keepalive}): ${fetchError.message}`;
      if (isRetryable) {
        diag.debug(message);
      } else {
        diag.warn(message);
      }
      return {
        status: isRetryable ? 'retryable' : 'failure',
        error: fetchError,
      };
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      if (keepalive) {
        inflightKeepaliveBytes -= request.byteLength;
        inflightKeepaliveCount--;
      }
    }
  }
}
