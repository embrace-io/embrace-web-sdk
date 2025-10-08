import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  mockNetworkRequestSpan,
  mockSessionSpan,
  mockSpan,
} from '../../testUtils/mockEntities/ReadableSpan.js';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
  setupTestTraceExporter,
} from '../../testUtils/index.js';
import { EmbraceSessionBatchedSpanProcessor } from './EmbraceSessionBatchedSpanProcessor.js';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import { DEFAULT_LIMITS, EmbraceLimitManager } from '../../managers/index.js';
import { emptyResource } from '@opentelemetry/resources';

const { expect } = chai;

class FailingSpanExporter extends InMemorySpanExporter {
  private readonly _error: Error | undefined;

  public constructor(error?: Error) {
    super();
    this._error = error;
  }

  public override export(
    _spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ) {
    resultCallback({
      code: ExportResultCode.FAILED,
      error: this._error,
    });
  }
}

describe('EmbraceSessionBatchedSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let processor: EmbraceSessionBatchedSpanProcessor;
  let diag: InMemoryDiagLogger;
  let limitManager: EmbraceLimitManager;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    // Clear localStorage to ensure clean test state
    localStorage.clear();
    clock = sinon.useFakeTimers(1756138004000);
    memoryExporter = setupTestTraceExporter();

    diag = new InMemoryDiagLogger();
    limitManager = new EmbraceLimitManager({
      diag,
      ...DEFAULT_LIMITS,
      maxAllowed: {
        ...DEFAULT_LIMITS.maxAllowed,
        span: 2,
        network_request: 3,
      },
    });

    processor = new EmbraceSessionBatchedSpanProcessor({
      resource: emptyResource(),
      exporter: memoryExporter,
      limitManager,
    });
  });

  afterEach(async () => {
    clock.restore();
    await processor.shutdown();
  });

  it('should not export non-session spans immediately', () => {
    processor.onEnd(mockSpan);
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
  });

  it('should export session span immediately', () => {
    processor.onEnd(mockSessionSpan);
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property('emb.type', 'ux.session');
  });

  it('should batch non-session spans with session span', () => {
    processor.onEnd(mockSpan);
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    processor.onEnd(mockSessionSpan);
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(2);
    const sessionSpan = finishedSpans[0];
    const nonSessionSpan = finishedSpans[1];
    expect(sessionSpan.attributes).to.have.property('emb.type', 'ux.session');
    expect(nonSessionSpan).to.have.property('name', 'mock span');
  });

  it('should not export spans after shutdown', async () => {
    await processor.shutdown();
    processor.onEnd(mockSessionSpan);
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
  });

  it('should clear the pending spans after exporting', () => {
    processor.onEnd(mockSpan);
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    processor.onEnd(mockSessionSpan);
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(2);
    memoryExporter.reset();
    processor.onEnd(mockSessionSpan);
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(1);
  });

  it('should handle the exporter returning a failed result', async () => {
    const diagLogger = new InMemoryDiagLogger();
    processor = new EmbraceSessionBatchedSpanProcessor({
      resource: emptyResource(),
      exporter: new FailingSpanExporter(),
      diag: diagLogger,
      limitManager,
    });

    processor.onEnd(mockSessionSpan);

    await Promise.resolve();

    expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
    expect(diagLogger.getErrorLogs()[0]).to.be.equal(
      'spans failed to export: unknown error'
    );
  });

  it('should log the exporter error if available', async () => {
    const diagLogger = new InMemoryDiagLogger();
    processor = new EmbraceSessionBatchedSpanProcessor({
      resource: emptyResource(),
      exporter: new FailingSpanExporter(new Error('some failure reason')),
      diag: diagLogger,
      limitManager,
    });

    processor.onEnd(mockSessionSpan);

    await Promise.resolve();

    expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
    expect(diagLogger.getErrorLogs()[0]).to.be.equal(
      'spans failed to export: some failure reason'
    );
  });

  it('should limit the amount of spans per session', () => {
    for (let i = 0; i < 10; i++) {
      processor.onEnd(mockSpan);
    }
    processor.onEnd(mockSessionSpan);
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(3);

    for (let i = 1; i < 3; i++) {
      expect(finishedSpans[i]).to.have.property('name', 'mock span');
    }

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.have.lengthOf(8);
    for (let i = 0; i < warningLogs.length; i++) {
      expect(warningLogs[i]).to.equal(
        'disallowing span because the maximum number of 2 has already been reached for this session'
      );
    }

    // Should allow more spans after reset
    limitManager.reset();
    memoryExporter.reset();
    processor.onEnd(mockSpan);
    processor.onEnd(mockSessionSpan);
    const nextFinishedSpans = memoryExporter.getFinishedSpans();
    expect(nextFinishedSpans).to.have.lengthOf(2);
  });

  it('should limit the amount of network request spans per session', () => {
    for (let i = 0; i < 10; i++) {
      processor.onEnd(mockNetworkRequestSpan);
    }
    processor.onEnd(mockSessionSpan);
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(4);

    for (let i = 1; i < 4; i++) {
      expect(finishedSpans[i]).to.have.property('name', 'mock span');
    }

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.have.lengthOf(7);
    for (let i = 0; i < warningLogs.length; i++) {
      expect(warningLogs[i]).to.equal(
        'disallowing network_request because the maximum number of 3 has already been reached for this session'
      );
    }

    // Should allow more spans after reset
    limitManager.reset();
    memoryExporter.reset();
    processor.onEnd(mockNetworkRequestSpan);
    processor.onEnd(mockSessionSpan);
    const nextFinishedSpans = memoryExporter.getFinishedSpans();
    expect(nextFinishedSpans).to.have.lengthOf(2);
  });

  describe('storage functionality', () => {
    let inMemoryStorage: InMemoryStorage;
    let processorWithStorage: EmbraceSessionBatchedSpanProcessor;

    beforeEach(() => {
      inMemoryStorage = new InMemoryStorage();
      processorWithStorage = new EmbraceSessionBatchedSpanProcessor({
        resource: emptyResource(),
        exporter: memoryExporter,
        limitManager,
        storage: inMemoryStorage,
      });
    });

    afterEach(async () => {
      await processorWithStorage.shutdown();
    });

    describe('getPendingSpansCount', () => {
      it('should return 0 when no spans are pending', () => {
        expect(processorWithStorage.getPendingSpansCount()).to.equal(0);
      });

      it('should return correct count when spans are pending', () => {
        processorWithStorage.onEnd(mockSpan);
        expect(processorWithStorage.getPendingSpansCount()).to.equal(1);

        processorWithStorage.onEnd(mockSpan);
        expect(processorWithStorage.getPendingSpansCount()).to.equal(2);
      });

      it('should return 0 after session span is processed', () => {
        processorWithStorage.onEnd(mockSpan);
        processorWithStorage.onEnd(mockSpan);
        expect(processorWithStorage.getPendingSpansCount()).to.equal(2);

        processorWithStorage.onEnd(mockSessionSpan);
        expect(processorWithStorage.getPendingSpansCount()).to.equal(0);
      });
    });

    describe('storePendingSpans', () => {
      it('should store spans to storage with correct key format', () => {
        processorWithStorage.onEnd(mockSpan);
        const sessionId = '732C0D87B14849BCAC153B5EB64B672D';

        processorWithStorage.storePendingSpans(sessionId, mockSessionSpan);

        expect(inMemoryStorage.length).to.equal(1);
        const key = inMemoryStorage.key(0);
        expect(key).to.match(
          /^embrace_pending_732C0D87B14849BCAC153B5EB64B672D_\d+$/
        );
      });

      it('should store both session span and pending spans', () => {
        processorWithStorage.onEnd(mockSpan);
        processorWithStorage.onEnd(mockNetworkRequestSpan);
        const sessionId = '732C0D87B14849BCAC153B5EB64B672D';

        processorWithStorage.storePendingSpans(sessionId, mockSessionSpan);

        const key = inMemoryStorage.key(0);
        expect(key).to.not.equal(null);
        const storedData = inMemoryStorage.getItem(key as string);
        expect(storedData).to.not.equal(null);
        const parsedSpans = JSON.parse(storedData as string) as ReadableSpan[];

        expect(parsedSpans).to.have.lengthOf(3); // session span + 2 pending spans
        expect(parsedSpans[0])
          .to.have.property('attributes')
          .that.has.property('emb.type', 'ux.session');
        expect(parsedSpans[1]).to.have.property('name', 'mock span');
        expect(parsedSpans[2])
          .to.have.property('attributes')
          .that.has.property('emb.type', 'perf.network_request');
      });

      it('should store just the session span if no other is pending', () => {
        const sessionId = '732C0D87B14849BCAC153B5EB64B672D';

        processorWithStorage.storePendingSpans(sessionId, mockSessionSpan);

        expect(inMemoryStorage.length).to.equal(1); // Only session span stored
        const key = inMemoryStorage.key(0);
        expect(key).to.not.equal(null);
        const storedData = inMemoryStorage.getItem(key as string);
        expect(storedData).to.not.equal(null);
        const parsedSpans = JSON.parse(storedData as string) as ReadableSpan[];

        expect(parsedSpans).to.have.lengthOf(1); // Only session span
        expect(parsedSpans[0])
          .to.have.property('attributes')
          .that.has.property('emb.type', 'ux.session');
      });

      it('should handle storage errors gracefully', () => {
        const diagLogger = new InMemoryDiagLogger();
        const failingStorage = new FailingStorage();

        const processorWithFailingStorage =
          new EmbraceSessionBatchedSpanProcessor({
            resource: emptyResource(),
            exporter: memoryExporter,
            limitManager,
            storage: failingStorage,
            diag: diagLogger,
          });

        processorWithFailingStorage.onEnd(mockSpan);
        processorWithFailingStorage.storePendingSpans(
          'test-session',
          mockSessionSpan
        );

        expect(diagLogger.getErrorLogs()).to.have.lengthOf(2);
        expect(diagLogger.getErrorLogs()[0]).to.include(
          'Failed to clear stored spans from storage:'
        );
        expect(diagLogger.getErrorLogs()[1]).to.include(
          'Failed to store spans to storage'
        );
      });
    });

    describe('clearStoredSpans', () => {
      beforeEach(() => {
        // Pre-populate storage with spans for different sessions
        inMemoryStorage.setItem(
          'embrace_pending_session1_1000',
          JSON.stringify([mockSpan])
        );
        inMemoryStorage.setItem(
          'embrace_pending_session2_1000',
          JSON.stringify([mockSpan])
        );
        inMemoryStorage.setItem('other_key', 'other_value');
      });

      it('should clear all spans for a specific session', () => {
        expect(inMemoryStorage.length).to.equal(3);

        processorWithStorage.clearStoredSpans('session1');

        expect(inMemoryStorage.length).to.equal(2);
        expect(
          inMemoryStorage.getItem('embrace_pending_session1_1000')
        ).to.equal(null);
        expect(
          inMemoryStorage.getItem('embrace_pending_session2_1000')
        ).to.not.equal(null);
        expect(inMemoryStorage.getItem('other_key')).to.not.equal(null);
      });

      it('should not affect other sessions or keys', () => {
        processorWithStorage.clearStoredSpans('session1');

        expect(
          inMemoryStorage.getItem('embrace_pending_session2_1000')
        ).to.equal(JSON.stringify([mockSpan]));
        expect(inMemoryStorage.getItem('other_key')).to.equal('other_value');
      });

      it('should handle non-existent session gracefully', () => {
        const initialLength = inMemoryStorage.length;

        processorWithStorage.clearStoredSpans('non-existent-session');

        expect(inMemoryStorage.length).to.equal(initialLength);
      });

      it('should handle storage errors gracefully', async () => {
        const diagLogger = new InMemoryDiagLogger();
        const failingStorage = new FailingStorage();

        const processorWithFailingStorage =
          new EmbraceSessionBatchedSpanProcessor({
            resource: emptyResource(),
            exporter: memoryExporter,
            limitManager,
            storage: failingStorage,
            diag: diagLogger,
          });

        // The clearStoredSpans method should not throw even with a failing storage
        expect(() => {
          processorWithFailingStorage.clearStoredSpans('session1');
        }).to.not.throw();

        await processorWithFailingStorage.shutdown();
      });
    });

    describe('expired spans functionality', () => {
      it('should export and remove expired spans', () => {
        const pastTime = clock.now - 2 * 60 * 60 * 1000; // 2 hours ago (expired)
        inMemoryStorage.setItem(
          `embrace_pending_expired_${pastTime}`,
          JSON.stringify([mockSpan, mockNetworkRequestSpan])
        );

        // Advance time to trigger the interval (which runs every 5 mins)
        clock.tick(5 * 60 * 1000);

        expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(2);
        expect(
          inMemoryStorage.getItem(`embrace_pending_expired_${pastTime}`)
        ).to.equal(null);
      });

      it('should not export non-expired spans', () => {
        const recentTime = clock.now - 30 * 60 * 1000; // 30 minutes ago (not expired)
        inMemoryStorage.setItem(
          `embrace_pending_recent_${recentTime}`,
          JSON.stringify([mockSpan])
        );

        // Advance time to trigger the interval (which runs every 60 seconds)
        clock.tick(60 * 1000);

        expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
        expect(
          inMemoryStorage.getItem(`embrace_pending_recent_${recentTime}`)
        ).to.not.equal(null);
      });

      it('should handle corrupted stored data', async () => {
        // Need to shut down the other processors so they don't pick up our stored spans
        await processor.shutdown();
        await processorWithStorage.shutdown();

        const diagLogger = new InMemoryDiagLogger();
        const processorWithDiag = new EmbraceSessionBatchedSpanProcessor({
          resource: emptyResource(),
          exporter: memoryExporter,
          limitManager,
          storage: inMemoryStorage,
          diag: diagLogger,
        });

        const pastTime = clock.now - 2 * 60 * 60 * 1000;
        inMemoryStorage.setItem(
          `embrace_pending_corrupted_${pastTime}`,
          'invalid json'
        );

        // Advance time to trigger the interval (which runs every 5 mins)
        clock.tick(5 * 60 * 1000);

        expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
        expect(diagLogger.getErrorLogs()[0]).to.include(
          'Failed to process expired spans'
        );
        expect(inMemoryStorage.length).to.equal(0);

        await processorWithDiag.shutdown();
      });

      it('should handle malformed key timestamps', () => {
        inMemoryStorage.setItem(
          'embrace_pending_invalid_timestamp',
          JSON.stringify([mockSpan])
        );

        // Advance time to trigger the interval (which runs every 60 seconds)
        clock.tick(60 * 1000);

        // Should not crash and should not export
        expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
      });
    });

    describe('integration with custom storage', () => {
      it('should work with custom storage implementation', () => {
        const customStorage = new InMemoryStorage();
        const processorWithCustomStorage =
          new EmbraceSessionBatchedSpanProcessor({
            resource: emptyResource(),
            exporter: memoryExporter,
            limitManager,
            storage: customStorage,
          });

        processorWithCustomStorage.onEnd(mockSpan);
        processorWithCustomStorage.storePendingSpans(
          'test-session',
          mockSessionSpan
        );

        expect(customStorage.length).to.equal(1);

        processorWithCustomStorage.clearStoredSpans('test-session');
        expect(customStorage.length).to.equal(0);
      });
    });
  });
});
