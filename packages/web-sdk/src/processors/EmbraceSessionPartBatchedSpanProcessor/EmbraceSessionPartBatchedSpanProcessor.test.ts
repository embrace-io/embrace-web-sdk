import { trace } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  InMemoryDiagLogger,
  setupTestStorage,
  setupTestTraceExporter,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../tests/utils/index.ts';
import {
  mockNetworkRequestSpan,
  mockSessionSpan,
  mockSpan,
} from '../../../tests/utils/mock-entities/ReadableSpan.ts';
import type { UserSessionManagerInternal } from '../../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceUserSessionManager,
} from '../../managers/index.ts';
import { OTelPerformanceManager } from '../../utils/index.ts';
import { EmbraceSessionPartBatchedSpanProcessor } from './EmbraceSessionPartBatchedSpanProcessor.ts';

const { expect } = chai;

class FailingSpanExporter extends InMemorySpanExporter {
  private readonly _error: Error | undefined;

  public constructor(error?: Error) {
    super();
    this._error = error;
  }

  public override export(
    _spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ) {
    resultCallback({
      code: ExportResultCode.FAILED,
      error: this._error,
    });
  }
}

describe('EmbraceSessionPartBatchedSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let processor: EmbraceSessionPartBatchedSpanProcessor;
  let diag: InMemoryDiagLogger;
  let limitManager: EmbraceLimitManager;
  let clock: sinon.SinonFakeTimers;
  let userSessionManager: UserSessionManagerInternal;

  beforeEach(() => {
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

    userSessionManager = new EmbraceUserSessionManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      limitManager,
      perf: new OTelPerformanceManager(),
      storage: setupTestStorage(),
      visibilityDoc: window.document,
    });

    processor = new EmbraceSessionPartBatchedSpanProcessor({
      exporter: memoryExporter,
      limitManager,
      userSessionManager,
    });
  });

  afterEach(async () => {
    clock.restore();
    await processor.shutdown();
    trace.disable();
  });

  it('should not export non-session-part spans immediately', () => {
    processor.onEnd(mockSpan);
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
  });

  it('should export session span immediately', () => {
    processor.onEnd(mockSessionSpan);
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      'emb.type',
      'ux.session_part',
    );
  });

  it('should batch non-session-part spans with session-part span', () => {
    processor.onEnd(mockSpan);
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    processor.onEnd(mockSessionSpan);
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(2);
    const sessionSpan = finishedSpans[0];
    const nonSessionSpan = finishedSpans[1];
    expect(sessionSpan.attributes).to.have.property(
      'emb.type',
      'ux.session_part',
    );
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

  type ExportFailedTest = {
    name: string;
    errorMessage?: string;
    expectedAttributeSuffix: string;
  };

  const exportFailedTests: ExportFailedTest[] = [
    {
      name: 'should handle the exporter returning an unknown failed result',
      expectedAttributeSuffix: 'unknown',
    },
    {
      name: 'should handle the exporter hitting the concurrent export limit',
      errorMessage: 'Concurrent export limit reached',
      expectedAttributeSuffix: 'concurrent_limit',
    },
    {
      name: 'should handle the exporter encountering a fetch error',
      errorMessage: 'Fetch request errored',
      expectedAttributeSuffix: 'fetch_error',
    },
  ];

  exportFailedTests.forEach((test) => {
    it(test.name, async () => {
      userSessionManager.startSessionPartInternal({ reason: 'init' });
      const diagLogger = new InMemoryDiagLogger();
      processor = new EmbraceSessionPartBatchedSpanProcessor({
        exporter: new FailingSpanExporter(
          test.errorMessage ? new Error(test.errorMessage) : undefined,
        ),
        diag: diagLogger,
        limitManager,
        userSessionManager,
      });

      processor.onEnd(mockSessionSpan);

      await Promise.resolve();

      userSessionManager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
      });

      userSessionManager.startSessionPartInternal({ reason: 'init' });
      userSessionManager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
      });

      const finishedSpans = memoryExporter.getFinishedSpans();
      expect(finishedSpans).to.have.lengthOf(2);
      const sessionSpan = finishedSpans[0];
      expect(sessionSpan.attributes).to.have.property(
        `emb.export_failed.${test.expectedAttributeSuffix}`,
        1,
      );
      expect(sessionSpan.attributes).not.to.have.property(
        `emb.previous_export_failed.${test.expectedAttributeSuffix}`,
      );

      const nextSessionSpan = finishedSpans[1];
      expect(nextSessionSpan.attributes).not.to.have.property(
        `emb.export_failed.${test.expectedAttributeSuffix}`,
      );
      expect(nextSessionSpan.attributes).to.have.property(
        `emb.previous_export_failed.${test.expectedAttributeSuffix}`,
        1,
      );

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.be.equal(
        `spans failed to export: ${test.errorMessage || 'unknown error'}`,
      );
    });
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
        'disallowing span because the maximum number of 2 has already been reached for this session',
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
        'disallowing network_request because the maximum number of 3 has already been reached for this session',
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
