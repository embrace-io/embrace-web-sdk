import * as chai from 'chai';
import type { ISerializer } from '#embrace-io/otlp-transformer';
import { GzipSerializer } from './GzipSerializer.ts';

const { expect } = chai;

interface FakeResponse {
  status: number;
}

const fakeSerializer: ISerializer<string, FakeResponse> = {
  serializeRequest(request: string): Uint8Array | undefined {
    if (!request) {
      return undefined;
    }
    return new TextEncoder().encode(request);
  },
  deserializeResponse(data: Uint8Array): FakeResponse {
    const text = new TextDecoder().decode(data);
    return JSON.parse(text) as FakeResponse;
  },
};

describe('GzipSerializer', () => {
  it('should return gzip-compressed bytes from serializeRequest', async () => {
    const serializer = new GzipSerializer(fakeSerializer);
    const result = serializer.serializeRequest('{"data": "hello"}');

    expect(result).to.be.instanceOf(Uint8Array);
    expect(result?.length).to.be.greaterThan(0);
    // gzip magic number and deflate method, checked without DecompressionStream
    expect([result?.[0], result?.[1], result?.[2]]).to.deep.equal([
      0x1f, 0x8b, 0x08,
    ]);
    // mtime field stays zeroed so payloads carry no wall clock
    expect([result?.[4], result?.[5], result?.[6], result?.[7]]).to.deep.equal([
      0, 0, 0, 0,
    ]);

    const decompressed = await new Response(
      new Response(result as Uint8Array<ArrayBuffer>).body?.pipeThrough(
        new DecompressionStream('gzip'),
      ),
    ).text();
    expect(decompressed).to.equal('{"data": "hello"}');
  });

  it('should return undefined when inner serializer returns undefined', () => {
    const serializer = new GzipSerializer(fakeSerializer);
    const result = serializer.serializeRequest('');

    expect(result).to.be.undefined;
  });

  it('should delegate deserializeResponse to inner serializer', () => {
    const serializer = new GzipSerializer(fakeSerializer);
    const responseData = new TextEncoder().encode('{"status": 200}');
    const result = serializer.deserializeResponse(responseData);

    expect(result).to.deep.equal({ status: 200 });
  });
});
