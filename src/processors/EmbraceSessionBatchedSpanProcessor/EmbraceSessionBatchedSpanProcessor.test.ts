import type { Span } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import {
  FakeSessionManager,
  InMemoryDiagLogger,
  setupTestTraceExporter,
} from '../../testUtils/index.js';
import {
  mockSessionSpan,
  mockSpan,
} from '../../testUtils/mockEntities/ReadableSpan.js';
import { EmbraceSessionBatchedSpanProcessor } from './EmbraceSessionBatchedSpanProcessor.js';

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
  let sessionManager: FakeSessionManager;

  beforeEach(() => {
    memoryExporter = setupTestTraceExporter();
    sessionManager = new FakeSessionManager();
    sessionManager.currentSessionSpan = { isRecording: () => true } as Span;
    processor = new EmbraceSessionBatchedSpanProcessor({
      exporter: memoryExporter,
      spanSessionManager: sessionManager,
    });
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

  it('should not export other spans if there is no session recording', () => {
    sessionManager.currentSessionSpan = { isRecording: () => false } as Span;
    processor.onEnd(mockSpan);
    processor.onEnd(mockSessionSpan);
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(1);
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
    });

    processor.onEnd(mockSessionSpan);

    await Promise.resolve();

    expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
    expect(diagLogger.getErrorLogs()[0]).to.be.equal(
      'spans failed to export: some failure reason'
    );
  });
});
