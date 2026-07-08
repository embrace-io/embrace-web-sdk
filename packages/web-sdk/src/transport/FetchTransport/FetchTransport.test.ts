import { DiagLogLevel, diag } from '@opentelemetry/api';
import * as chai from 'chai';
import {
  fakeFetchGetKeepalive,
  fakeFetchInstall,
  fakeFetchRespondWith,
  fakeFetchRestore,
  InMemoryDiagLogger,
} from '../../../tests/utils/index.ts';
import { _resetKeepaliveTracking, FetchTransport } from './FetchTransport.ts';

const { expect } = chai;

const makeTransport = (
  overrides?: Partial<ConstructorParameters<typeof FetchTransport>[0]>,
) =>
  new FetchTransport({
    url: 'http://example.com',
    headers: {},
    compression: 'none',
    ...overrides,
  });

const smallPayload = new TextEncoder().encode('{"small": true}');
const largePayload = new Uint8Array(49153); // 1 byte over the 48KiB budget

interface Deferred {
  promise: Promise<Response>;
  resolve: (value: Response) => void;
  reject: (reason: Error) => void;
}

function createDeferred(): Deferred {
  let resolve!: (value: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function reinstallFetch() {
  fakeFetchRestore();
  return fakeFetchInstall();
}

describe('FetchTransport', () => {
  let diagLogger: InMemoryDiagLogger;

  beforeEach(() => {
    _resetKeepaliveTracking();
    fakeFetchInstall();
    diagLogger = new InMemoryDiagLogger();
    diag.setLogger(diagLogger, DiagLogLevel.ALL);
  });

  afterEach(() => {
    fakeFetchRestore();
    diag.disable();
  });

  describe('keepalive budget', () => {
    it('should set keepalive to true for payloads within the budget', async () => {
      fakeFetchRespondWith('ok', { status: 200 });
      const transport = makeTransport();

      await transport.send(smallPayload, 1000);

      expect(fakeFetchGetKeepalive()).to.equal(true);
    });

    it('should set keepalive to true for payloads exactly at the budget', async () => {
      fakeFetchRespondWith('ok', { status: 200 });
      const transport = makeTransport();

      const exactPayload = new Uint8Array(49152);
      await transport.send(exactPayload, 1000);

      expect(fakeFetchGetKeepalive()).to.equal(true);
    });

    it('should set keepalive to false for payloads exceeding the budget', async () => {
      fakeFetchRespondWith('ok', { status: 200 });
      const transport = makeTransport();

      await transport.send(largePayload, 1000);

      expect(fakeFetchGetKeepalive()).to.equal(false);
    });
  });

  describe('keepalive cumulative tracking', () => {
    it('should disable keepalive when cumulative bytes exceed the budget', async () => {
      const deferred = createDeferred();
      const stub = reinstallFetch();
      stub.onCall(0).returns(deferred.promise);
      stub.onCall(1).resolves(new Response('ok', { status: 200 }));

      const transport = makeTransport();

      // 30KiB payload — fits individually but two exceed the 48KiB budget
      const payload30k = new Uint8Array(30 * 1024);

      // Start first request (stays inflight)
      const first = transport.send(payload30k, 5000);
      // Allow microtask to run so fetch is called
      await Promise.resolve();

      expect(fakeFetchGetKeepalive(0)).to.equal(true);

      // Second request should exceed cumulative budget
      await transport.send(payload30k, 5000);

      expect(fakeFetchGetKeepalive(1)).to.equal(false);

      // Clean up
      deferred.resolve(new Response('ok', { status: 200 }));
      await first;
    });

    it('should disable keepalive when concurrent count reaches 9', async () => {
      const deferreds: Deferred[] = [];
      const stub = reinstallFetch();

      for (let i = 0; i < 9; i++) {
        const d = createDeferred();
        deferreds.push(d);
        stub.onCall(i).returns(d.promise);
      }
      stub.onCall(9).resolves(new Response('ok', { status: 200 }));

      const transport = makeTransport();
      const tinyPayload = new Uint8Array(1);

      // Start 9 concurrent requests
      const pending = [];
      for (let i = 0; i < 9; i++) {
        pending.push(transport.send(tinyPayload, 5000));
        await Promise.resolve();
      }

      for (let i = 0; i < 9; i++) {
        expect(fakeFetchGetKeepalive(i)).to.equal(true);
      }

      // 10th request should exceed concurrent limit
      await transport.send(tinyPayload, 5000);

      expect(fakeFetchGetKeepalive(9)).to.equal(false);

      // Clean up
      for (const d of deferreds) {
        d.resolve(new Response('ok', { status: 200 }));
      }
      await Promise.all(pending);
    });

    it('should decrement counters after request completes', async () => {
      const deferred = createDeferred();
      const stub = reinstallFetch();
      stub.onCall(0).returns(deferred.promise);
      stub.onCall(1).resolves(new Response('ok', { status: 200 }));
      stub.onCall(2).resolves(new Response('ok', { status: 200 }));

      const transport = makeTransport();
      const payload30k = new Uint8Array(30 * 1024);

      // First request stays inflight
      const first = transport.send(payload30k, 5000);
      await Promise.resolve();

      // Second request exceeds cumulative budget
      await transport.send(payload30k, 5000);

      expect(fakeFetchGetKeepalive(1)).to.equal(false);

      // Resolve first request to free up budget
      deferred.resolve(new Response('ok', { status: 200 }));
      await first;

      // Third request should fit now
      await transport.send(payload30k, 5000);

      expect(fakeFetchGetKeepalive(2)).to.equal(true);
    });

    it('should decrement counters after request fails', async () => {
      const deferred = createDeferred();
      const stub = reinstallFetch();
      stub.onCall(0).returns(deferred.promise);
      stub.onCall(1).resolves(new Response('ok', { status: 200 }));
      stub.onCall(2).resolves(new Response('ok', { status: 200 }));

      const transport = makeTransport();
      const payload30k = new Uint8Array(30 * 1024);

      // First request stays inflight
      const first = transport.send(payload30k, 5000);
      await Promise.resolve();

      // Second request exceeds cumulative budget
      await transport.send(payload30k, 5000);

      expect(fakeFetchGetKeepalive(1)).to.equal(false);

      // Reject first request to free up budget
      deferred.reject(new TypeError('Failed to fetch'));
      await first;

      // Third request should fit now
      await transport.send(payload30k, 5000);

      expect(fakeFetchGetKeepalive(2)).to.equal(true);
    });
  });

  describe('keepalive tracking with gzip compression', () => {
    it('should use compressed size for budget check', async () => {
      const deferred = createDeferred();
      const stub = reinstallFetch();

      let firstFetchCalled!: () => void;
      const firstFetchCalledPromise = new Promise<void>((r) => {
        firstFetchCalled = r;
      });

      stub.onCall(0).callsFake(() => {
        firstFetchCalled();
        return deferred.promise;
      });
      stub.onCall(1).resolves(new Response('ok', { status: 200 }));

      const transport = makeTransport({ compression: 'gzip' });

      // 40KiB of zeros: exceeds 48KiB budget uncompressed (40K + 40K > 48K)
      // but compresses to ~30 bytes, well within budget
      const payload40k = new Uint8Array(40 * 1024);

      const first = transport.send(payload40k, 5000);

      // Wait for compression and first fetch call
      await firstFetchCalledPromise;

      // Second send: budget check uses compressed size of first (~30 bytes),
      // so this 40KiB (also ~30 bytes compressed) easily fits
      await transport.send(payload40k, 5000);

      expect(fakeFetchGetKeepalive(0)).to.equal(true);
      expect(fakeFetchGetKeepalive(1)).to.equal(true);

      deferred.resolve(new Response('ok', { status: 200 }));
      await first;
    });

    it('should disable keepalive when compressed bytes exceed budget', async () => {
      const deferred = createDeferred();
      const stub = reinstallFetch();

      let firstFetchCalled!: () => void;
      const firstFetchCalledPromise = new Promise<void>((r) => {
        firstFetchCalled = r;
      });

      stub.onCall(0).callsFake(() => {
        firstFetchCalled();
        return deferred.promise;
      });
      stub.onCall(1).resolves(new Response('ok', { status: 200 }));

      const transport = makeTransport({ compression: 'gzip' });

      // Random data does not compress well — stays close to original size
      const payload30k = new Uint8Array(30 * 1024);
      crypto.getRandomValues(payload30k);

      const first = transport.send(payload30k, 5000);
      await firstFetchCalledPromise;

      // Second random payload: compressed ~30KiB + compressed ~30KiB > 48KiB
      const payload30k2 = new Uint8Array(30 * 1024);
      crypto.getRandomValues(payload30k2);
      await transport.send(payload30k2, 5000);

      expect(fakeFetchGetKeepalive(0)).to.equal(true);
      expect(fakeFetchGetKeepalive(1)).to.equal(false);

      deferred.resolve(new Response('ok', { status: 200 }));
      await first;
    });

    it('should free budget after gzip request completes', async () => {
      fakeFetchRespondWith('ok', { status: 200 });
      const transport = makeTransport({ compression: 'gzip' });

      const payload40k = new Uint8Array(40 * 1024);

      await transport.send(payload40k, 5000);
      await transport.send(payload40k, 5000);

      expect(fakeFetchGetKeepalive(0)).to.equal(true);
      expect(fakeFetchGetKeepalive(1)).to.equal(true);
    });

    it('should free budget after gzip request fails', async () => {
      const stub = reinstallFetch();
      stub.onCall(0).rejects(new TypeError('Failed to fetch'));
      stub.onCall(1).resolves(new Response('ok', { status: 200 }));

      const transport = makeTransport({ compression: 'gzip' });

      const payload40k = new Uint8Array(40 * 1024);

      await transport.send(payload40k, 5000);
      await transport.send(payload40k, 5000);

      expect(fakeFetchGetKeepalive(0)).to.equal(true);
      expect(fakeFetchGetKeepalive(1)).to.equal(true);
    });
  });

  describe('network errors', () => {
    it('should return retryable when fetch throws a TypeError', async () => {
      reinstallFetch().rejects(new TypeError('Failed to fetch'));

      const transport = makeTransport();
      const result = await transport.send(smallPayload, 1000);

      expect(result).to.deep.equal({
        status: 'retryable',
        error: new TypeError('Failed to fetch'),
      });
    });

    it('should return retryable when fetch throws a TimeoutError', async () => {
      reinstallFetch().rejects(
        new DOMException('The operation was aborted', 'TimeoutError'),
      );

      const transport = makeTransport();
      const result = await transport.send(smallPayload, 1000);

      expect(result.status).to.equal('retryable');
    });
  });

  describe('HTTP status classification', () => {
    it('should return retryable for 5xx responses', async () => {
      fakeFetchRespondWith('error', { status: 503 });
      const transport = makeTransport();

      const result = await transport.send(smallPayload, 1000);

      expect(result.status).to.equal('retryable');
    });

    it('should return failure for 4xx responses', async () => {
      fakeFetchRespondWith('error', { status: 400 });
      const transport = makeTransport();

      const result = await transport.send(smallPayload, 1000);

      expect(result.status).to.equal('failure');
    });
  });

  describe('diagnostic logging', () => {
    it('should log debug when keepalive is downgraded for byte budget', async () => {
      fakeFetchRespondWith('ok', { status: 200 });
      const transport = makeTransport();

      await transport.send(largePayload, 1000);

      const debugs = diagLogger.getDebugLogs();
      const match = debugs.find((msg) => msg.includes('inflight bytes'));
      expect(match).to.be.a('string');
    });

    it('should log debug when keepalive is downgraded for concurrent count', async () => {
      const deferreds: Deferred[] = [];
      const stub = reinstallFetch();

      for (let i = 0; i < 9; i++) {
        const d = createDeferred();
        deferreds.push(d);
        stub.onCall(i).returns(d.promise);
      }
      stub.onCall(9).resolves(new Response('ok', { status: 200 }));

      const transport = makeTransport();
      const tinyPayload = new Uint8Array(1);

      const pending = [];
      for (let i = 0; i < 9; i++) {
        pending.push(transport.send(tinyPayload, 5000));
        await Promise.resolve();
      }

      // 10th request should trigger the debug log
      await transport.send(tinyPayload, 5000);

      const debugs = diagLogger.getDebugLogs();
      const match = debugs.find((msg) => msg.includes('concurrent count'));
      expect(match).to.be.a('string');

      for (const d of deferreds) {
        d.resolve(new Response('ok', { status: 200 }));
      }
      await Promise.all(pending);
    });

    it('should log debug when fetch throws a transient error', async () => {
      reinstallFetch().rejects(new TypeError('Failed to fetch'));

      const transport = makeTransport();
      await transport.send(smallPayload, 1000);

      const debugs = diagLogger.getDebugLogs();
      const match = debugs.find((msg) =>
        msg.includes('Fetch transport failed'),
      );
      expect(match).to.be.a('string');
    });

    it('should log debug when HTTP response is 5xx', async () => {
      fakeFetchRespondWith('error', { status: 500 });
      const transport = makeTransport();

      await transport.send(smallPayload, 1000);

      const match = diagLogger
        .getDebugLogs()
        .find((msg) => msg.includes('HTTP 500'));
      expect(match).to.be.a('string');
    });

    it('should warn via diag when HTTP response is 4xx', async () => {
      fakeFetchRespondWith('error', { status: 401 });
      const transport = makeTransport();

      await transport.send(smallPayload, 1000);

      const warns = diagLogger.getWarnLogs();
      const match = warns.find((msg) => msg.includes('HTTP 401'));
      expect(match).to.be.a('string');
    });
  });
});
