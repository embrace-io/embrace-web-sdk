import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import * as chai from 'chai';
import * as sinon from 'sinon';
import type { SpanSessionManager } from '../../../api-sessions/index.ts';
import { session } from '../../../api-sessions/index.ts';
import {
  KEY_EMB_SESSION_REASON_ENDED,
  KEY_EMB_SESSION_REASON_STARTED,
} from '../../../constants/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSpanSessionManager,
} from '../../../managers/index.ts';
import {
  InMemoryDiagLogger,
  MockPerformanceManager,
  setupTestTraceExporter,
} from '../../../testUtils/index.ts';
import { TIMEOUT_TIME } from './constants.ts';
import { SpanSessionTimeoutInstrumentation } from './SpanSessionTimeoutInstrumentation.ts';

const { expect } = chai;

describe('SpanSessionTimeoutInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: SpanSessionTimeoutInstrumentation;
  let clock: sinon.SinonFakeTimers;
  let diag: InMemoryDiagLogger;
  let perf: MockPerformanceManager;
  let spanSessionManager: SpanSessionManager;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);
    diag = new InMemoryDiagLogger();
    spanSessionManager = new EmbraceSpanSessionManager({
      perf,
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });
    session.setGlobalSessionManager(spanSessionManager);
  });

  afterEach(() => {
    clock.restore();
    instrumentation.disable();
  });

  it('should not start a new session when instantiated', () => {
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    instrumentation = new SpanSessionTimeoutInstrumentation({ diag, perf });
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
  });

  it('should end the current session when timeout is reached and start a new one', () => {
    instrumentation = new SpanSessionTimeoutInstrumentation({ diag, perf });
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    const sessionID = spanSessionManager.getSessionId();
    // the session should still be active until TIMEOUT_TIME
    clock.tick(TIMEOUT_TIME - 1);
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    void expect(spanSessionManager.getSessionId()).to.equal(sessionID);
    // the session should end after TIMEOUT_TIME. A new one started
    clock.tick(1);
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    const newSessionID = spanSessionManager.getSessionId();
    expect(newSessionID).to.not.equal(sessionID);
    expect(diag.getDebugLogs()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()[0]).to.equal('Timeout detected');
    let finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    let sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'timer',
    );
    expect(sessionSpan.attributes).to.have.property(ATTR_SESSION_ID, sessionID);

    memoryExporter.reset();
    spanSessionManager.endSessionSpan();
    finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_STARTED,
      'timer',
    );
  });

  it('should reset the timeout when a new session is started', () => {
    instrumentation = new SpanSessionTimeoutInstrumentation({ diag, perf });
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    const sessionAID = spanSessionManager.getSessionId();
    // the session should still be active until TIMEOUT_TIME
    clock.tick(TIMEOUT_TIME - 1);
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    void expect(spanSessionManager.getSessionId()).to.equal(sessionAID);
    // a new session is started
    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    const sessionBID = spanSessionManager.getSessionId();
    void expect(sessionBID).to.not.equal(sessionAID);
    // the session should not end after TIMEOUT_TIME, because a one was started before that
    clock.tick(1);
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    void expect(spanSessionManager.getSessionId()).to.equal(sessionBID);
    // it should end after a new TIMEOUT_TIME windows from the time the new session started
    // the session should still be active until TIMEOUT_TIME
    clock.tick(TIMEOUT_TIME - 2);
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    void expect(spanSessionManager.getSessionId()).to.equal(sessionBID);
    // the session should end after TIMEOUT_TIME. A new one started
    clock.tick(1);
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    const sessionCID = spanSessionManager.getSessionId();
    void expect(sessionCID).to.not.equal(sessionBID);
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(2);
    const sessionSpanA = finishedSpans[0];
    expect(sessionSpanA.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'manual',
    );
    expect(sessionSpanA.attributes).to.have.property(
      ATTR_SESSION_ID,
      sessionAID,
    );
    const sessionSpanB = finishedSpans[1];
    expect(sessionSpanB.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'timer',
    );
    expect(sessionSpanB.attributes).to.have.property(
      ATTR_SESSION_ID,
      sessionBID,
    );
  });

  it('should not track timeout if disabled', () => {
    instrumentation = new SpanSessionTimeoutInstrumentation({ diag, perf });
    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    const sessionID = spanSessionManager.getSessionId();
    instrumentation.disable();
    clock.tick(TIMEOUT_TIME);
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(0);
    void expect(spanSessionManager.getSessionId()).to.equal(sessionID);
  });
});
