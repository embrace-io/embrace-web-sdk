import type {
  ExportResponse,
  IExporterTransport,
} from '@opentelemetry/otlp-exporter-base';
import type { FetchRequestParameters } from './types.ts';

export class FetchTransport implements IExporterTransport {
  public constructor(private readonly _config: FetchRequestParameters) {}

  /* eslint-disable baseline-js/use-baseline -- compression-streams baseline widely available since May 2023, plugin data stale */
  // _compressRequest compresses the data using the gzip algorithm.
  // Embrace Data endpoints require the data to be compressed.
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
  /* eslint-enable baseline-js/use-baseline */

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

    if (this._config.compression === 'gzip') {
      request = await FetchTransport._compressRequest(data);

      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = request.length.toString();
    }

    // Use AbortSignal.timeout if available, otherwise fallback to AbortController
    // https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
    let signal: AbortSignal;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if ('timeout' in AbortSignal) {
      signal = AbortSignal.timeout(timeoutMillis);
    } else {
      const controller = new AbortController();
      signal = controller.signal;
      timeoutId = setTimeout(() => {
        controller.abort(new DOMException('TimeoutError', 'TimeoutError'));
      }, timeoutMillis);
    }

    try {
      const response = await fetch(this._config.url, {
        method: 'POST',
        keepalive: true,
        headers,
        body: request,
        signal,
      });

      if (response.ok) {
        return { status: 'success' };
      } else {
        return {
          status: 'failure',
          error: new Error(`${response.status} Fetch request failed`),
        };
      }
    } catch (error) {
      return {
        status: 'failure',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }
}
