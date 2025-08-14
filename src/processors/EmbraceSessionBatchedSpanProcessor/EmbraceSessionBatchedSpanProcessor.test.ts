import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import {
  mockNetworkRequestSpan,
  mockSessionSpan,
  mockSpan,
} from '../../testUtils/mockEntities/ReadableSpan.js';
import {
  InMemoryDiagLogger,
  setupTestTraceExporter,
} from '../../testUtils/index.js';
import { EmbraceSessionBatchedSpanProcessor } from './EmbraceSessionBatchedSpanProcessor.js';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import { EmbraceLimitManager, DEFAULT_LIMITS } from '../../managers/index.js';

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

  beforeEach(() => {
    // Clear localStorage to ensure clean test state
    localStorage.clear();

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
      exporter: memoryExporter,
      limitManager,
    });
  });

  afterEach(async () => {
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
});
