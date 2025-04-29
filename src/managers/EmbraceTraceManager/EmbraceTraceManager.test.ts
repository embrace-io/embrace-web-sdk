import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { KEY_EMB_ERROR_CODE, KEY_EMB_TYPE } from '../../constants/index.js';
import { setupTestTraceExporter } from '../../testUtils/index.js';
import { EmbraceTraceManager } from './EmbraceTraceManager.js';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceTraceManager', () => {
  let manager: EmbraceTraceManager;
  let memoryExporter: InMemorySpanExporter;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    manager = new EmbraceTraceManager();
  });

  it('should initialize a EmbraceTraceManager', () => {
    expect(manager).to.be.instanceOf(EmbraceTraceManager);
  });

  it('should start and end a perf span', () => {
    const span = manager.startPerformanceSpan('perf-span');
    void expect(span).to.not.be.null;
    expect(() => {
      span.end();
    }).to.not.throw();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const perfSpan = finishedSpans[0];
    expect(perfSpan.name).to.equal('perf-span');
    expect(perfSpan.attributes).to.have.property(KEY_EMB_TYPE, 'perf');
    expect(hrTimeToMilliseconds(perfSpan.endTime)).to.be.greaterThanOrEqual(
      hrTimeToMilliseconds(perfSpan.startTime)
    );
  });

  it('should offer a method for ending a failed perf span', () => {
    const span = manager.startPerformanceSpan('perf-span');
    void expect(span).to.not.be.null;
    span.fail();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const perfSpan = finishedSpans[0];
    expect(perfSpan.name).to.equal('perf-span');
    expect(perfSpan.attributes).to.have.property(KEY_EMB_TYPE, 'perf');
    expect(perfSpan.attributes).to.have.property(KEY_EMB_ERROR_CODE, 'FAILURE');
  });

  it('should allow the code and end time of a failed perf span to be overwritten', () => {
    const span = manager.startPerformanceSpan('perf-span', {
      startTime: 1741650200000,
    });
    void expect(span).to.not.be.null;
    span.fail({
      code: 'user_abandon',
      endTime: 1741651200000,
    });
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const perfSpan = finishedSpans[0];
    expect(perfSpan.name).to.equal('perf-span');
    expect(perfSpan.attributes).to.have.property(KEY_EMB_TYPE, 'perf');
    expect(perfSpan.attributes).to.have.property(
      KEY_EMB_ERROR_CODE,
      'USER_ABANDON'
    );
    expect(hrTimeToMilliseconds(perfSpan.endTime)).to.be.equal(1741651200000);
  });
});
