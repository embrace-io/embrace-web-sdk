import {
  ExportResponse,
  IExporterTransport,
} from '@opentelemetry/otlp-exporter-base';
import { FetchRequestParameters } from './types.js';

export class FetchTransport implements IExporterTransport {
  constructor(private config: FetchRequestParameters) {}

  // _compressRequest compresses the data using the gzip algorithm.

  public async _asyncSend(
    data: Uint8Array,
    timeoutMillis: number
  ): Promise<ExportResponse> {
    let request = data;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.compression === 'gzip') {
      request = await this._compressRequest(data);

      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = request.length.toString();
    }

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        keepalive: true,
        headers: headers,
        body: request,
        signal: AbortSignal.timeout(timeoutMillis),
      });

      if (response.ok) {
        return { status: 'success' };
      } else {
        return { status: 'failure', error: new Error('Fetch request failed') };
      }
    } catch {
      return { status: 'failure', error: new Error('Fetch request errored') };
    }
  }

  send(data: Uint8Array, timeoutMillis: number): Promise<ExportResponse> {
    return this._asyncSend(data, timeoutMillis);
  }

  shutdown(): void {
    // Intentionally left empty, nothing to do.
  }

  // Embrace Data endpoints require the data to be compressed.
  private async _compressRequest(data: Uint8Array): Promise<Uint8Array> {
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
      compressedChunks.reduce((acc, chunk) => acc + chunk.length, 0)
    );

    let offset = 0;

    for (const chunk of compressedChunks) {
      compressedData.set(chunk, offset);
      offset += chunk.length;
    }

    return compressedData;
  }
}
