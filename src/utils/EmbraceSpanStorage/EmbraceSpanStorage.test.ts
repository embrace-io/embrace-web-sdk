import * as chai from 'chai';
import * as sinon from 'sinon';
import { EmbraceSpanStorage } from './EmbraceSpanStorage.js';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
  mockSpan,
  setupTestTraceExporter,
} from '../../testUtils/index.js';
import type {
  InMemorySpanExporter,
  ReadableSpan,
} from '@opentelemetry/sdk-trace-web';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSpanSessionManager,
} from '../../managers/index.js';
import { trace } from '@opentelemetry/api';

const { expect } = chai;

describe('EmbraceSpanStorage', () => {
  let memoryExporter: InMemorySpanExporter;
  let spanStorage: EmbraceSpanStorage;
  let storage: InMemoryStorage;
  let diag: InMemoryDiagLogger;
  let mockOnExport: sinon.SinonSpy;
  let clock: sinon.SinonFakeTimers;
  let spanSessionManager: EmbraceSpanSessionManager;

  beforeEach(() => {
    memoryExporter = setupTestTraceExporter();
    storage = new InMemoryStorage();
    diag = new InMemoryDiagLogger();
    mockOnExport = sinon.spy();
    clock = sinon.useFakeTimers();

    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager: new EmbraceLimitManager({ ...DEFAULT_LIMITS }),
    });

    spanStorage = new EmbraceSpanStorage({
      storage,
      diag,
      onExpiredSpansExport: mockOnExport,
      spanSessionManager,
    });
  });

  afterEach(() => {
    spanStorage.destroy();
    clock.restore();
    trace.disable();
  });

  describe('storePendingSpans', () => {
    it('should store spans with session ID and timestamp', () => {
      const sessionSpan = mockSpan;
      const pendingSpans = [mockSpan, mockSpan];

      spanStorage.storePendingSpans('session123', sessionSpan, pendingSpans);

      expect(storage.length).to.equal(1);
      const key = storage.key(0) as string;
      expect(key).to.match(/embrace_pending_session123_\d+/);

      const storedData = storage.getItem(key);
      expect(storedData).to.not.equal(null);
      const parsedData = JSON.parse(storedData || '') as ReadableSpan[];
      expect(parsedData).to.have.length(3); // session span + 2 pending spans

      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    });

    it('should clear existing stored spans for the same session ID', () => {
      const sessionSpan = mockSpan;
      const pendingSpans = [mockSpan];

      // Store spans twice with same session ID
      spanStorage.storePendingSpans('session123', sessionSpan, pendingSpans);
      spanStorage.storePendingSpans('session123', sessionSpan, pendingSpans);

      expect(storage.length).to.equal(1); // Should only have one entry

      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    });

    it('should handle storage errors gracefully', () => {
      const spanStorageWithFailingStorage = new EmbraceSpanStorage({
        storage: new FailingStorage(),
        diag,
        spanSessionManager,
      });

      expect(() => {
        spanStorageWithFailingStorage.storePendingSpans(
          'session123',
          mockSpan,
          []
        );
      }).to.not.throw();

      const errorLogs = diag.getErrorLogs();
      expect(
        errorLogs.some(log => log.includes('Failed to store spans to storage'))
      ).to.equal(true);
      spanStorageWithFailingStorage.destroy();

      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    });

    it('should not store spans when max pending spans limit is exceeded', () => {
      spanSessionManager.startSessionSpan();

      const sessionSpan = mockSpan;
      const pendingSpans = [mockSpan];

      // Fill storage to exactly the limit (10 items)
      for (let i = 0; i < 10; i++) {
        spanStorage.storePendingSpans(`session${i}`, sessionSpan, pendingSpans);
      }

      expect(storage.length).to.equal(10);

      // Now the next attempt should be rejected because count >= 10
      spanStorage.storePendingSpans(
        'sessionOverLimit',
        sessionSpan,
        pendingSpans
      );
      expect(storage.length).to.equal(10);

      // Should have logged a warning
      const warnLogs = diag.getWarnLogs();
      expect(warnLogs).to.have.lengthOf(1);
      expect(warnLogs[0]).to.equal(
        'Not storing pending spans as the max number of items was reached'
      );

      // Should not have the over-limit session stored
      let foundOverLimitKey = false;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.includes('sessionOverLimit')) {
          foundOverLimitKey = true;
          break;
        }
      }
      void expect(foundOverLimitKey).to.be.false;
      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

      // Should record the limit reached on the session span
      spanSessionManager.endSessionSpan();
      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(1);
      expect(finishedSpans[0].attributes).to.have.property(
        'emb.max_pending_spans_reached',
        1
      );
    });
  });

  describe('clearStoredSpans', () => {
    it('should clear all stored spans for a given session ID', () => {
      const sessionSpan = mockSpan;
      const pendingSpans = [mockSpan];

      // Store spans for multiple sessions
      spanStorage.storePendingSpans('session123', sessionSpan, pendingSpans);
      spanStorage.storePendingSpans('session456', sessionSpan, pendingSpans);

      expect(storage.length).to.equal(2);

      spanStorage.clearStoredSpans('session123');

      expect(storage.length).to.equal(1);
      const remainingKey = storage.key(0) as string;
      expect(remainingKey).to.include('session456');

      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    });

    it('should handle storage errors gracefully', () => {
      const spanStorageWithFailingStorage = new EmbraceSpanStorage({
        storage: new FailingStorage(),
        diag,
        spanSessionManager,
      });

      expect(() => {
        spanStorageWithFailingStorage.clearStoredSpans('session123');
      }).to.not.throw();

      const errorLogs = diag.getErrorLogs();
      expect(
        errorLogs.some(log =>
          log.includes('Failed to clear stored spans from storage')
        )
      ).to.equal(true);

      spanStorageWithFailingStorage.destroy();

      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    });
  });

  describe('expired spans check', () => {
    it('should start expired spans check on construction', () => {
      expect(clock.countTimers()).to.be.greaterThan(0);
    });

    it('should handle expired spans check without errors', () => {
      const sessionSpan = mockSpan;
      const pendingSpans = [mockSpan];

      spanStorage.storePendingSpans('session123', sessionSpan, pendingSpans);
      expect(storage.length).to.equal(1);

      expect(mockOnExport.calledOnce).to.equal(false);

      // Advance clock so that the interval runs.
      clock.tick(65 * 60 * 1000);
      expect(mockOnExport.calledOnce).to.equal(true);

      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    });

    it('should handle invalid stored data gracefully', () => {
      storage.setItem('embrace_pending_session123_12345', 'invalid json');

      expect(() => {
        spanStorage.checkAndExportExpiredSpans();
      }).to.not.throw();

      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    });
  });

  describe('destroy', () => {
    it('should stop expired spans check', () => {
      const timerCount = clock.countTimers();
      spanStorage.destroy();
      expect(clock.countTimers()).to.equal(timerCount - 1);

      expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    });
  });
});
