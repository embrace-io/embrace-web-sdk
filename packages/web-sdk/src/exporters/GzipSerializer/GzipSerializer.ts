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
    // mtime 0 keeps the wall clock out of the gzip header.
    return gzipSync(serialized, { mtime: 0 });
  }

  public deserializeResponse(data: Uint8Array): Response {
    return this._serializer.deserializeResponse(data);
  }
}
