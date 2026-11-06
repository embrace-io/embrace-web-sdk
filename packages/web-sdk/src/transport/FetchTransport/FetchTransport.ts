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

// Browsers open at most 6 HTTP/1.1 connections per host. A stalled collector
// on a host that the page also calls must leave half of them to the page. The
// cap is also under Chrome's 9-request concurrent keepalive limit per renderer
// process, so keepalive needs only the byte budget check.
const MAX_INFLIGHT_REQUESTS = 3;

let inflightKeepaliveBytes = 0;
let inflightRequestCount = 0;

/** @internal for testing only */
export function _resetInflightTracking(): void {
  inflightKeepaliveBytes = 0;
  inflightRequestCount = 0;
}

/**
 * Reads the response body to its end and discards it.
 *
 * Chromium returns the request's share of the keepalive quota only once the
 * body has been read to the end, and it skips the buffering consumer that would
 * otherwise drain it when the response has `Cache-Control: no-store`, which
 * collectors commonly send. Cancelling is the client-abort path and measures
 * far slower, so the body is read rather than cancelled.
 *
 * @see https://fetch.spec.whatwg.org/#fetch-processresponseendofbody
 * @see https://issues.chromium.org/issues/546438373
 */
async function drainResponseBody(response: Response): Promise<void> {
  try {
    // Empty and opaque responses have no body to read.
    const body = response.body;
    if (!body) {
      return;
    }

    // Throws when the body is already locked to another reader, which happens
    // when the same response is handed to more than one export.
    const reader = body.getReader();
    try {
      // Chunks are dropped as they arrive so a large response is never buffered.
      let chunk = await reader.read();
      while (!chunk.done) {
        chunk = await reader.read();
      }
    } finally {
      // A held reader keeps the body locked, and a later export handed the same
      // response could then not drain it.
      reader.releaseLock();
    }
  } catch (error) {
    // The export outcome is decided by the response status, a body that cannot
    // be read must not change it.
    const drainError =
      error instanceof Error ? error : new Error(String(error));
    diag.debug(
      `Fetch transport failed to drain response body: ${drainError.message}`,
    );
  }
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
    let reservedBytes = 0;

    const clearTimeoutIfSet = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };

    // The connection stays open until the body drains, so the drain returns the
    // request slot and the keepalive bytes.
    const release = () => {
      clearTimeoutIfSet();
      inflightRequestCount--;
      // reservedBytes stays 0 for a request sent without keepalive.
      inflightKeepaliveBytes -= reservedBytes;
    };
    let drainOwnsCleanup = false;

    if (inflightRequestCount >= MAX_INFLIGHT_REQUESTS) {
      clearTimeoutIfSet();
      diag.debug(
        `Fetch transport deferred a request: ${inflightRequestCount} requests inflight at limit of ${MAX_INFLIGHT_REQUESTS}`,
      );
      // Retryable, so the retrying transport sends it again once a slot frees,
      // within the export deadline.
      return {
        status: 'retryable',
        error: new Error('Concurrent request limit reached'),
      };
    }
    inflightRequestCount++;

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

      keepalive =
        inflightKeepaliveBytes + request.byteLength <= KEEPALIVE_BYTE_BUDGET;

      if (keepalive) {
        reservedBytes = request.byteLength;
        inflightKeepaliveBytes += reservedBytes;
      } else {
        diag.debug(
          `Sending without keepalive: inflight bytes (${inflightKeepaliveBytes} + ${request.byteLength}) would exceed ${KEEPALIVE_BYTE_BUDGET}B budget`,
        );
      }

      const response = await fetch(this._config.url, {
        method: 'POST',
        keepalive,
        headers,
        body: request,
        signal,
      });

      // Not awaited: the status already decides the export outcome, and a
      // collector that stalls mid-body must not hold up the caller.
      const drained = drainResponseBody(response);
      // Set once the promise exists so an earlier throw still reaches the
      // cleanup in `finally`.
      drainOwnsCleanup = true;
      // Trailing the drain keeps the abort signal armed, so a stalled body can
      // hold neither the request slot, the budget nor the timer forever.
      void drained.finally(release);

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
      // Only the paths that threw before a response reach this: once the drain
      // exists it does the cleanup.
      if (!drainOwnsCleanup) {
        release();
      }
    }
  }
}
