import { diag } from '@opentelemetry/api';
import { gzipSync } from 'fflate';
import type { ISerializer } from '#embrace-io/otlp-transformer';

// Compression has to be synchronous so the unload-path keepalive fetch is
// issued in the same task, which rules out the async CompressionStream.
export class GzipSerializer<Request, Response>
  implements ISerializer<Request, Response>
{
  public constructor(
    private readonly _serializer: ISerializer<Request, Response>,
  ) {}

  public serializeRequest(request: Request): Uint8Array | undefined {
    const serialized = this._serializer.serializeRequest(request);
    if (!serialized) {
      return undefined;
    }
    try {
      // mtime 0 keeps the wall clock out of the gzip header.
      return gzipSync(serialized, { mtime: 0 });
    } catch (error) {
      // The export delegate turns undefined into a generic 'Nothing to send'
      // failure, so this is the only place the real cause is reported.
      diag.error(
        `gzip compression failed, dropping export: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }

  public deserializeResponse(data: Uint8Array): Response {
    return this._serializer.deserializeResponse(data);
  }
}
