import { SeverityNumber } from '@opentelemetry/api-logs';
import { timeInputToHrTime } from '@opentelemetry/core';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { TEST_DYNAMIC_CONFIG_MANAGER } from '../../../../tests/utils/constants.ts';
import { MockPerformanceManager } from '../../../../tests/utils/MockPerformanceManager.ts';
import { setupTestLogExporter } from '../../../../tests/utils/setupTestLogExporter.ts';
import { setupTestStorage } from '../../../../tests/utils/setupTestStorage.ts';
import { log } from '../../../api-logs/logAPI.ts';
import type { LogManager } from '../../../api-logs/manager/types.ts';
import { DEFAULT_LIMITS } from '../../../managers/EmbraceLimitManager/constants.ts';
import { EmbraceLimitManager } from '../../../managers/EmbraceLimitManager/EmbraceLimitManager.ts';
import { EmbraceLogManager } from '../../../managers/EmbraceLogManager/EmbraceLogManager.ts';
import { EmbraceUserSessionManager } from '../../../managers/EmbraceUserSessionManager/EmbraceUserSessionManager.ts';
import { GlobalExceptionInstrumentation } from './GlobalExceptionInstrumentation.ts';

const { expect } = chai;

class GlobalExceptionTestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'GlobalExceptionTestErrorName';
  }
}

describe('GlobalExceptionInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let logManager: LogManager;
  let instrumentation: GlobalExceptionInstrumentation;
  let perf: MockPerformanceManager;
  let clock: sinon.SinonFakeTimers;
  let existingErrorHandler: OnErrorEventHandler;
  let existingRejectionHandler:
    | ((this: WindowEventHandlers, ev: PromiseRejectionEvent) => unknown)
    | null;

  before(() => {
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    const limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);
    const storage = setupTestStorage();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);
    logManager = new EmbraceLogManager({
      userSessionManager: new EmbraceUserSessionManager({
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
        limitManager,
        perf,
        storage,
        visibilityDoc: window.document,
      }),
      limitManager,
      perf,
      storage,
      visibilityDoc: window.document,
    });
    log.setGlobalLogManager(logManager);
    instrumentation = new GlobalExceptionInstrumentation({
      perf,
    });
    // The runner will fail our tests if it detects an unhandled error / rejection, temporarily ignore the ones we're
    // artificially triggering from this suite
    existingRejectionHandler = window.onunhandledrejection;
    window.onunhandledrejection = null;
    existingErrorHandler = window.onerror;
    window.onerror = (
      event: Event | string,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error,
    ) => {
      if (
        error?.name !== 'GlobalExceptionTestErrorName' &&
        event !== 'global exception test error message'
      ) {
        existingErrorHandler?.call(window, event, source, lineno, colno, error);
      }
    };
  });

  afterEach(() => {
    instrumentation.disable();
    clock.restore();
    window.onerror = existingErrorHandler;
    window.onunhandledrejection = existingRejectionHandler;
  });

  it('should add a log when there is an unhandled error', () => {
    const err = new GlobalExceptionTestError('my custom error');
    const evt = new ErrorEvent('error', {
      error: err,
    });
    window.dispatchEvent(evt);

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const exceptionLog = finishedLogs[0];

    void expect(exceptionLog.hrTime).to.deep.equal(
      timeInputToHrTime(clock.now + evt.timeStamp),
    );
    void expect(exceptionLog.severityNumber).to.be.equal(SeverityNumber.ERROR);
    void expect(exceptionLog.severityText).to.be.equal('ERROR');
    void expect(exceptionLog.body).to.be.equal('my custom error');
    void expect(exceptionLog.attributes).to.deep.equal({
      'emb.type': 'sys.exception',
      'emb.exception_cause': '',
      'emb.exception_handling': 'unhandled_error',
      'exception.type': 'GlobalExceptionTestError',
      'exception.name': 'GlobalExceptionTestErrorName',
      'exception.message': 'my custom error',
      'exception.stacktrace': err.stack,
      'emb.js_file_bundle_ids': '{}',
      'emb.state': 'foreground',
      'emb.exception_number': 1,
    });
  });

  it('should add a log when there is an unhandled promise rejection with a string reason', () => {
    const evt = new PromiseRejectionEvent('unhandledrejection', {
      promise: new Promise(() => {}),
      reason: 'promise was rejected',
    });
    window.dispatchEvent(evt);

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const exceptionLog = finishedLogs[0];

    void expect(exceptionLog.hrTime).to.deep.equal(
      timeInputToHrTime(clock.now + evt.timeStamp),
    );
    void expect(exceptionLog.severityNumber).to.be.equal(SeverityNumber.ERROR);
    void expect(exceptionLog.severityText).to.be.equal('ERROR');
    void expect(exceptionLog.body).to.be.equal('promise was rejected');
    void expect(exceptionLog.attributes).to.deep.equal({
      'emb.type': 'sys.exception',
      'emb.exception_cause': '',
      'emb.exception_handling': 'unhandled_rejection',
      'exception.type': 'String',
      'exception.name': 'String',
      'exception.message': 'promise was rejected',
      'exception.stacktrace': '',
      'emb.js_file_bundle_ids': '{}',
      'emb.state': 'foreground',
      'emb.exception_number': 1,
    });
  });

  it('should add a log when there is an unhandled promise rejection with an error reason', () => {
    const err = new GlobalExceptionTestError('my custom error');
    const evt = new PromiseRejectionEvent('unhandledrejection', {
      promise: new Promise(() => {}),
      reason: err,
    });
    window.dispatchEvent(evt);

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const exceptionLog = finishedLogs[0];

    void expect(exceptionLog.hrTime).to.deep.equal(
      timeInputToHrTime(clock.now + evt.timeStamp),
    );
    void expect(exceptionLog.severityNumber).to.be.equal(SeverityNumber.ERROR);
    void expect(exceptionLog.severityText).to.be.equal('ERROR');
    void expect(exceptionLog.body).to.be.equal('my custom error');
    void expect(exceptionLog.attributes).to.deep.equal({
      'emb.type': 'sys.exception',
      'emb.exception_cause': '',
      'emb.exception_handling': 'unhandled_rejection',
      'exception.type': 'GlobalExceptionTestError',
      'exception.name': 'GlobalExceptionTestErrorName',
      'exception.message': 'my custom error',
      'exception.stacktrace': err.stack,
      'emb.js_file_bundle_ids': '{}',
      'emb.state': 'foreground',
      'emb.exception_number': 1,
    });
  });

  it('should add a log when there is an unhandled promise rejection with an unknown reason', () => {
    const evt = new PromiseRejectionEvent('unhandledrejection', {
      promise: new Promise(() => {}),
      reason: 1234,
    });
    window.dispatchEvent(evt);

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const exceptionLog = finishedLogs[0];

    void expect(exceptionLog.hrTime).to.deep.equal(
      timeInputToHrTime(clock.now + evt.timeStamp),
    );
    void expect(exceptionLog.severityNumber).to.be.equal(SeverityNumber.ERROR);
    void expect(exceptionLog.severityText).to.be.equal('ERROR');
    void expect(exceptionLog.body).to.be.equal('1234');
    void expect(exceptionLog.attributes).to.deep.equal({
      'emb.type': 'sys.exception',
      'emb.exception_cause': '',
      'emb.exception_handling': 'unhandled_rejection',
      'exception.type': 'Number',
      'exception.name': 'Number',
      'exception.message': '1234',
      'exception.stacktrace': '',
      'emb.js_file_bundle_ids': '{}',
      'emb.state': 'foreground',
      'emb.exception_number': 1,
    });
  });

  it('should add a log when there is an unhandled error missing event.error', () => {
    const evt = new ErrorEvent('error', {
      message: 'global exception test error message',
    });
    window.dispatchEvent(evt);

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const exceptionLog = finishedLogs[0];

    void expect(exceptionLog.hrTime).to.deep.equal(
      timeInputToHrTime(clock.now + evt.timeStamp),
    );
    void expect(exceptionLog.severityNumber).to.be.equal(SeverityNumber.ERROR);
    void expect(exceptionLog.severityText).to.be.equal('ERROR');
    void expect(exceptionLog.body).to.be.equal(
      'global exception test error message',
    );
    void expect(exceptionLog.attributes).to.deep.equal({
      'emb.type': 'sys.exception',
      'emb.exception_cause': '',
      'emb.exception_handling': 'unhandled_error',
      'exception.type': 'String',
      'exception.name': 'String',
      'exception.message': 'global exception test error message',
      'exception.stacktrace': '',
      'emb.js_file_bundle_ids': '{}',
      'emb.state': 'foreground',
      'emb.exception_number': 1,
    });
  });
});
