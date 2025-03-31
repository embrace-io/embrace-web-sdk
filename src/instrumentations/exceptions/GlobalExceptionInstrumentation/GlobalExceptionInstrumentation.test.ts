import * as chai from 'chai';
import * as sinon from 'sinon';
import { MockPerformanceManager } from '../../../testUtils/index.js';
import { setupTestLogExporter } from '../../../testUtils/setupTestLogExporter/setupTestLogExporter.js';
import { GlobalExceptionInstrumentation } from './GlobalExceptionInstrumentation.js';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { timeInputToHrTime } from '@opentelemetry/core';

const { expect } = chai;

class CustomError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CustomErrorName';
  }
}

class GlobalExceptionInstrumentationExposedHandlers extends GlobalExceptionInstrumentation {
  public simulateError(event: ErrorEvent) {
    this._onErrorHandler(event);
  }

  public simulatePromiseRejection(event: PromiseRejectionEvent) {
    this._onUnhandledRejectionHandler(event);
  }
}

describe('GlobalExceptionInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let instrumentation: GlobalExceptionInstrumentationExposedHandlers;
  let perf: MockPerformanceManager;
  let clock: sinon.SinonFakeTimers;

  before(() => {
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);
  });

  afterEach(() => {
    instrumentation.disable();
    clock.restore();
  });

  it('should add a log when there is an unhandled error', () => {
    instrumentation = new GlobalExceptionInstrumentationExposedHandlers({
      perf,
    });

    const err = new CustomError('my custom error');
    const evt = new ErrorEvent('error', {
      error: err,
    });
    instrumentation.simulateError(evt);

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const exceptionLog = finishedLogs[0];

    void expect(exceptionLog.hrTime).to.deep.equal(
      timeInputToHrTime(clock.now + evt.timeStamp)
    );
    void expect(exceptionLog.severityNumber).to.be.equal(SeverityNumber.ERROR);
    void expect(exceptionLog.severityText).to.be.equal('ERROR');
    void expect(exceptionLog.body).to.be.equal('my custom error');
    void expect(exceptionLog.attributes).to.deep.equal({
      'emb.type': 'sys.exception',
      'emb.exception_handling': 'UNHANDLED',
      'exception.type': 'CustomError',
      'exception.name': 'CustomErrorName',
      'exception.message': 'my custom error',
      'exception.stacktrace': err.stack,
    });
  });

  it('should add a log when there is an unhandled promise rejection with a string reason', () => {
    instrumentation = new GlobalExceptionInstrumentationExposedHandlers({
      perf,
    });
    const evt = new PromiseRejectionEvent('unhandledrejection', {
      promise: new Promise(() => {}),
      reason: 'promise was rejected',
    });
    instrumentation.simulatePromiseRejection(evt);

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const exceptionLog = finishedLogs[0];

    void expect(exceptionLog.hrTime).to.deep.equal(
      timeInputToHrTime(clock.now + evt.timeStamp)
    );
    void expect(exceptionLog.severityNumber).to.be.equal(SeverityNumber.ERROR);
    void expect(exceptionLog.severityText).to.be.equal('ERROR');
    void expect(exceptionLog.body).to.be.equal('promise was rejected');
    void expect(exceptionLog.attributes).to.deep.equal({
      'emb.type': 'sys.exception',
      'emb.exception_handling': 'UNHANDLED',
      'exception.type': 'Error',
      'exception.name': 'Error',
      'exception.message': 'promise was rejected',
      'exception.stacktrace': '',
    });
  });

  it('should add a log when there is an unhandled promise rejection with an error reason', () => {
    instrumentation = new GlobalExceptionInstrumentationExposedHandlers({
      perf,
    });

    const err = new CustomError('my custom error');
    const evt = new PromiseRejectionEvent('unhandledrejection', {
      promise: new Promise(() => {}),
      reason: err,
    });
    instrumentation.simulatePromiseRejection(evt);

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const exceptionLog = finishedLogs[0];

    void expect(exceptionLog.hrTime).to.deep.equal(
      timeInputToHrTime(clock.now + evt.timeStamp)
    );
    void expect(exceptionLog.severityNumber).to.be.equal(SeverityNumber.ERROR);
    void expect(exceptionLog.severityText).to.be.equal('ERROR');
    void expect(exceptionLog.body).to.be.equal('my custom error');
    void expect(exceptionLog.attributes).to.deep.equal({
      'emb.type': 'sys.exception',
      'emb.exception_handling': 'UNHANDLED',
      'exception.type': 'CustomError',
      'exception.name': 'CustomErrorName',
      'exception.message': 'my custom error',
      'exception.stacktrace': err.stack,
    });
  });

  it('should add a log when there is an unhandled promise rejection with an unknown reason', () => {
    instrumentation = new GlobalExceptionInstrumentationExposedHandlers({
      perf,
    });

    const evt = new PromiseRejectionEvent('unhandledrejection', {
      promise: new Promise(() => {}),
      reason: 1234,
    });
    instrumentation.simulatePromiseRejection(evt);

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const exceptionLog = finishedLogs[0];

    void expect(exceptionLog.hrTime).to.deep.equal(
      timeInputToHrTime(clock.now + evt.timeStamp)
    );
    void expect(exceptionLog.severityNumber).to.be.equal(SeverityNumber.ERROR);
    void expect(exceptionLog.severityText).to.be.equal('ERROR');
    void expect(exceptionLog.body).to.be.equal('Unhandled Rejected Promise');
    void expect(exceptionLog.attributes).to.deep.equal({
      'emb.type': 'sys.exception',
      'emb.exception_handling': 'UNHANDLED',
      'exception.type': 'Error',
      'exception.name': 'Error',
      'exception.message': 'Unhandled Rejected Promise',
      'exception.stacktrace': '',
    });
  });
});
