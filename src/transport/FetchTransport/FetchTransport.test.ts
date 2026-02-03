import type { ExportResponse } from '@opentelemetry/otlp-exporter-base';
import * as chai from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { FetchTransport } from './FetchTransport.ts';

chai.use(sinonChai);
const { expect } = chai;

// Helper to assert failure response
const assertFailure = (
  result: ExportResponse,
): result is { status: 'failure'; error: Error } => {
  return result.status === 'failure' && 'error' in result;
};

describe('FetchTransport', () => {
  let transport: FetchTransport;
  let fetchStub: sinon.SinonStub;
  let originalAbortSignalTimeout: typeof AbortSignal.timeout;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    originalAbortSignalTimeout = AbortSignal.timeout;
  });

  afterEach(() => {
    sinon.restore();
    AbortSignal.timeout = originalAbortSignalTimeout;
  });

  describe('without compression', () => {
    beforeEach(() => {
      transport = new FetchTransport({
        url: 'https://test.example.com/api',
        headers: { 'X-Custom': 'header' },
        compression: 'none',
      });
    });

    it('should send data without gzip compression', async () => {
      fetchStub.resolves(new Response(null, { status: 200 }));
      const data = new Uint8Array([1, 2, 3, 4]);

      await transport.send(data, 5000);

      expect(fetchStub).to.have.been.calledOnce;
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal('https://test.example.com/api');
      expect(options.method).to.equal('POST');
      expect(options.headers).to.not.have.property('Content-Encoding');
      expect(options.headers).to.have.property(
        'Content-Type',
        'application/json',
      );
      expect(options.headers).to.have.property('X-Custom', 'header');
      expect(options.body).to.deep.equal(data);
    });
  });

  describe('with compression', () => {
    beforeEach(() => {
      transport = new FetchTransport({
        url: 'https://test.example.com/api',
        headers: {},
        compression: 'gzip',
      });
    });

    it('should send data with gzip compression', async () => {
      fetchStub.resolves(new Response(null, { status: 200 }));
      const data = new Uint8Array([1, 2, 3, 4]);

      await transport.send(data, 5000);

      expect(fetchStub).to.have.been.calledOnce;
      const [, options] = fetchStub.firstCall.args;
      expect(options.headers).to.have.property('Content-Encoding', 'gzip');
      expect(options.headers).to.have.property('Content-Length');
      // Body should be compressed (different from original)
      expect(options.body).to.be.instanceOf(Uint8Array);
    });
  });

  describe('AbortSignal handling', () => {
    beforeEach(() => {
      transport = new FetchTransport({
        url: 'https://test.example.com/api',
        headers: {},
        compression: 'none',
      });
    });

    it('should use AbortSignal.timeout when available', async () => {
      const mockSignal = { aborted: false } as AbortSignal;
      const timeoutStub = sinon.stub().returns(mockSignal);
      AbortSignal.timeout = timeoutStub;
      fetchStub.resolves(new Response(null, { status: 200 }));

      await transport.send(new Uint8Array([1, 2, 3]), 5000);

      expect(timeoutStub).to.have.been.calledOnceWith(5000);
      expect(fetchStub.firstCall.args[1].signal).to.equal(mockSignal);
    });

    it('should fallback to AbortController when AbortSignal.timeout is not available', async () => {
      // Remove AbortSignal.timeout to simulate older browser
      // @ts-expect-error - simulating older browser
      delete AbortSignal.timeout;

      fetchStub.resolves(new Response(null, { status: 200 }));

      await transport.send(new Uint8Array([1, 2, 3]), 5000);

      expect(fetchStub).to.have.been.calledOnce;
      const [, options] = fetchStub.firstCall.args;
      expect(options.signal).to.be.instanceOf(AbortSignal);
    });

    it('should clear timeout on successful request when using fallback', async () => {
      // @ts-expect-error - simulating older browser
      delete AbortSignal.timeout;

      const clearTimeoutSpy = sinon.spy(globalThis, 'clearTimeout');
      fetchStub.resolves(new Response(null, { status: 200 }));

      await transport.send(new Uint8Array([1, 2, 3]), 5000);

      expect(clearTimeoutSpy).to.have.been.called;
    });
  });

  describe('response handling', () => {
    beforeEach(() => {
      transport = new FetchTransport({
        url: 'https://test.example.com/api',
        headers: {},
        compression: 'none',
      });
    });

    it('should return success for 2xx responses', async () => {
      fetchStub.resolves(new Response(null, { status: 200 }));

      const result = await transport.send(new Uint8Array([1, 2, 3]), 5000);

      expect(result.status).to.equal('success');
    });

    it('should return success for 204 response', async () => {
      fetchStub.resolves(new Response(null, { status: 204 }));

      const result = await transport.send(new Uint8Array([1, 2, 3]), 5000);

      expect(result.status).to.equal('success');
    });

    it('should return failure for 4xx responses', async () => {
      fetchStub.resolves(new Response(null, { status: 400 }));

      const result = await transport.send(new Uint8Array([1, 2, 3]), 5000);

      expect(assertFailure(result)).to.be.true;
      if (assertFailure(result)) {
        expect(result.error).to.be.instanceOf(Error);
        expect(result.error.message).to.include('400');
      }
    });

    it('should return failure for 5xx responses', async () => {
      fetchStub.resolves(new Response(null, { status: 500 }));

      const result = await transport.send(new Uint8Array([1, 2, 3]), 5000);

      expect(assertFailure(result)).to.be.true;
      if (assertFailure(result)) {
        expect(result.error).to.be.instanceOf(Error);
        expect(result.error.message).to.include('500');
      }
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      transport = new FetchTransport({
        url: 'https://test.example.com/api',
        headers: {},
        compression: 'none',
      });
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network failure');
      fetchStub.rejects(networkError);

      const result = await transport.send(new Uint8Array([1, 2, 3]), 5000);

      expect(assertFailure(result)).to.be.true;
      if (assertFailure(result)) {
        expect(result.error).to.equal(networkError);
      }
    });

    it('should handle non-Error thrown values', async () => {
      // sinon.stub.rejects('string') creates Error('string'), not a string
      // To test non-Error thrown values, we need a custom implementation
      fetchStub.callsFake(() => {
        throw 'string error';
      });

      const result = await transport.send(new Uint8Array([1, 2, 3]), 5000);

      expect(assertFailure(result)).to.be.true;
      if (assertFailure(result)) {
        expect(result.error).to.be.instanceOf(Error);
        expect(result.error.message).to.equal('string error');
      }
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new DOMException('TimeoutError', 'TimeoutError');
      fetchStub.rejects(timeoutError);

      const result = await transport.send(new Uint8Array([1, 2, 3]), 5000);

      expect(assertFailure(result)).to.be.true;
      if (assertFailure(result)) {
        expect(result.error).to.equal(timeoutError);
      }
    });
  });

  describe('shutdown', () => {
    it('should be a no-op', () => {
      transport = new FetchTransport({
        url: 'https://test.example.com/api',
        headers: {},
        compression: 'none',
      });

      // shutdown should not throw
      expect(() => transport.shutdown()).to.not.throw();
    });
  });

  describe('fetch options', () => {
    it('should set keepalive to true', async () => {
      transport = new FetchTransport({
        url: 'https://test.example.com/api',
        headers: {},
        compression: 'none',
      });
      fetchStub.resolves(new Response(null, { status: 200 }));

      await transport.send(new Uint8Array([1, 2, 3]), 5000);

      expect(fetchStub.firstCall.args[1].keepalive).to.be.true;
    });

    it('should merge custom headers with content-type', async () => {
      transport = new FetchTransport({
        url: 'https://test.example.com/api',
        headers: {
          'X-Custom-Header': 'custom-value',
          Authorization: 'Bearer token',
        },
        compression: 'none',
      });
      fetchStub.resolves(new Response(null, { status: 200 }));

      await transport.send(new Uint8Array([1, 2, 3]), 5000);

      const headers = fetchStub.firstCall.args[1].headers;
      expect(headers).to.have.property('Content-Type', 'application/json');
      expect(headers).to.have.property('X-Custom-Header', 'custom-value');
      expect(headers).to.have.property('Authorization', 'Bearer token');
    });
  });
});
