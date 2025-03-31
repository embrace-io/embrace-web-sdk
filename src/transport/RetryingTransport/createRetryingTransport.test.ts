import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { createRetryingTransport } from './createRetryingTransport.js';
import type { IExporterTransport } from '@opentelemetry/otlp-exporter-base';
import type { SinonStub } from 'sinon';
import sinon from 'sinon';

chai.use(sinonChai);
const { expect } = chai;

describe('createRetryingTransport', () => {
  let stubbedTransport: IExporterTransport;
  let sendStub: SinonStub;
  let clock: sinon.SinonFakeTimers;
  let retryingTransport: IExporterTransport;

  const assertBackoffs = async (expectedBackoffs: number[]) => {
    for (let i = 0; i < expectedBackoffs.length; i++) {
      const attempts = i + 1;
      // these awaits are required to allow the promises queued by the RetryingTransport
      // a chance to execute, otherwise we'll be stuck in a deadlock
      await Promise.resolve();

      // Should still be on the previous attempt before the backoff is reached
      clock.tick(expectedBackoffs[i] - 100);
      await Promise.resolve();
      expect(sendStub).callCount(attempts);

      // Should have made another attempt now that we've passed the backoff
      clock.tick(200);
      await Promise.resolve();
      expect(sendStub).callCount(attempts + 1);
    }
  };

  beforeEach(() => {
    clock = sinon.useFakeTimers({});
    sendStub = sinon.stub();
    stubbedTransport = {
      send: sendStub,
      shutdown: sinon.stub(),
    };
    retryingTransport = createRetryingTransport({
      transport: stubbedTransport,
    });
  });

  afterEach(() => {
    clock.restore();
  });

  it('should return successful responses', async () => {
    sendStub.resolves({ status: 'success' });
    const result = await retryingTransport.send(
      new TextEncoder().encode('{"data": "my data"}'),
      1000
    );

    expect(result).to.deep.equal({ status: 'success' });
    void expect(sendStub).calledOnce;
  });

  it('should return non-retryable failure responses', async () => {
    sendStub.resolves({ status: 'failure', error: new Error('some failure') });
    const result = await retryingTransport.send(
      new TextEncoder().encode('{"data": "my data"}'),
      1000
    );

    expect(result).to.deep.equal({
      status: 'failure',
      error: new Error('some failure'),
    });
    void expect(sendStub).calledOnce;
  });

  it('should return retryable failures up to max attempts', async () => {
    sendStub.resolves({ status: 'retryable' });
    const pendingResult = retryingTransport.send(
      new TextEncoder().encode('{"data": "my data"}'),
      30_000
    );

    await assertBackoffs([1000, 1500, 2250, 3375, 5000]);

    const result = await pendingResult;
    expect(result).to.deep.equal({
      status: 'retryable',
    });
  });

  it('should stop retrying early if the deadline is hit', async () => {
    sendStub.resolves({ status: 'retryable' });
    const pendingResult = retryingTransport.send(
      new TextEncoder().encode('{"data": "my data"}'),
      3000
    );

    await assertBackoffs([1000, 1500, 2250]);

    const result = await pendingResult;
    expect(result).to.deep.equal({
      status: 'retryable',
    });
  });

  it("should use the response's retry time if available", async () => {
    sendStub.resolves({ status: 'retryable', retryInMillis: 400 });
    const pendingResult = retryingTransport.send(
      new TextEncoder().encode('{"data": "my data"}'),
      3000
    );

    await assertBackoffs([400, 400, 400, 400, 400]);

    const result = await pendingResult;
    expect(result).to.deep.equal({
      status: 'retryable',
      retryInMillis: 400,
    });
  });

  it('should return a successful response after retrying', async () => {
    sendStub.resolves({ status: 'retryable' });
    const pendingResult = retryingTransport.send(
      new TextEncoder().encode('{"data": "my data"}'),
      30_000
    );

    await Promise.resolve();
    sendStub.resolves({ status: 'success' });
    clock.tick(1100);

    const result = await pendingResult;
    expect(result).to.deep.equal({
      status: 'success',
    });
  });
});
