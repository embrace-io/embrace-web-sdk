import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import {
  fakeFetchGetBody,
  fakeFetchGetMethod,
  fakeFetchGetRequestHeaders,
  fakeFetchGetUrl,
  fakeFetchInstall,
  fakeFetchRespondWith,
  fakeFetchRestore,
} from '../../testUtils/index.js';
import { createFetchTransport } from './createFetchTransport.js';

chai.use(sinonChai);
const { expect } = chai;
describe('createFetchTransport', () => {
  beforeEach(() => {
    fakeFetchInstall();
  });

  afterEach(() => {
    fakeFetchRestore();
  });

  it('should allow sending without compression', async () => {
    const transport = createFetchTransport({
      url: 'http://example.com',
      headers: { foo: 'bar' },
      compression: 'none',
    });

    fakeFetchRespondWith('ok', { status: 200 });
    const result = await transport.send(
      new TextEncoder().encode('{"data": "my data"}'),
      1000
    );

    expect(fakeFetchGetUrl()).to.equal('http://example.com');
    expect(fakeFetchGetMethod()).to.equal('POST');
    const body = await new Response(fakeFetchGetBody()).text();
    expect(body).to.equal('{"data": "my data"}');
    expect(
      fakeFetchGetRequestHeaders() as Record<string, string>
    ).to.deep.equal({
      'Content-Type': 'application/json',
      foo: 'bar',
    });
    expect(result).to.deep.equal({ status: 'success' });
  });

  it('should allow sending with compression', async () => {
    const transport = createFetchTransport({
      url: 'http://example.com',
      headers: { foo: 'bar' },
      compression: 'gzip',
    });

    fakeFetchRespondWith('ok', { status: 200 });
    const result = await transport.send(
      new TextEncoder().encode('{"data": "my data"}'),
      1000
    );

    expect(fakeFetchGetUrl()).to.equal('http://example.com');
    expect(fakeFetchGetMethod()).to.equal('POST');
    const decompressedStream = new Response(
      fakeFetchGetBody()
    ).body?.pipeThrough(new DecompressionStream('gzip'));
    const body = await new Response(decompressedStream).text();
    expect(body).to.equal('{"data": "my data"}');
    expect(
      (fakeFetchGetRequestHeaders() as Record<string, string>)[
        'Content-Encoding'
      ]
    ).to.equal('gzip');
    expect(result).to.deep.equal({ status: 'success' });
  });

  it('should handle request failures', async () => {
    const transport = createFetchTransport({
      url: 'http://example.com',
      headers: { foo: 'bar' },
      compression: 'none',
    });

    fakeFetchRespondWith('error', { status: 500 });
    const result = await transport.send(
      new TextEncoder().encode('{"data": "my data"}'),
      1000
    );

    expect(fakeFetchGetUrl()).to.equal('http://example.com');
    expect(fakeFetchGetMethod()).to.equal('POST');
    const body = await new Response(fakeFetchGetBody()).text();
    expect(body).to.equal('{"data": "my data"}');
    expect(
      fakeFetchGetRequestHeaders() as Record<string, string>
    ).to.deep.equal({
      'Content-Type': 'application/json',
      foo: 'bar',
    });
    expect(result).to.deep.equal({
      status: 'failure',
      error: new Error('Fetch request failed'),
    });
  });
});
