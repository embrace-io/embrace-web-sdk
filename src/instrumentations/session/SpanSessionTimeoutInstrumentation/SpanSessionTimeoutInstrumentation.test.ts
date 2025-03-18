import { trace, type TracerProvider } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider
} from '@opentelemetry/sdk-trace-web';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  session,
  type SpanSessionManager
} from '../../../api-sessions/index.js';
import { KEY_EMB_SESSION_REASON_ENDED } from '../../../constants/attributes.js';
import {
  InMemoryDiagLogger,
  MockPerformanceManager
} from '../../../testUtils/index.js';
import { EmbraceSpanSessionManager } from '../EmbraceSpanSessionManager/index.js';
import { TIMEOUT_TIME } from './constants.js';
import { SpanSessionTimeoutInstrumentation } from './SpanSessionTimeoutInstrumentation.js';

const { expect } = chai;

describe('SpanSessionTimeoutInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: SpanSessionTimeoutInstrumentation;
  let tracerProvider: TracerProvider;
  let clock: sinon.SinonFakeTimers;
  let diag: InMemoryDiagLogger;
  let perf: MockPerformanceManager;
  let spanSessionManager: SpanSessionManager;

  before(() => {
    memoryExporter = new InMemorySpanExporter();
    tracerProvider = new WebTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(memoryExporter)]
    });
    trace.setGlobalTracerProvider(tracerProvider);
  });

  beforeEach(() => {
    memoryExporter.reset();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);
    diag = new InMemoryDiagLogger();
    spanSessionManager = new EmbraceSpanSessionManager({ perf });
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
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'max_time_reached'
    );
    expect(sessionSpan.attributes).to.have.property(ATTR_SESSION_ID, sessionID);
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
      'new_session_started'
    );
    expect(sessionSpanA.attributes).to.have.property(
      ATTR_SESSION_ID,
      sessionAID
    );
    const sessionSpanB = finishedSpans[1];
    expect(sessionSpanB.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'max_time_reached'
    );
    expect(sessionSpanB.attributes).to.have.property(
      ATTR_SESSION_ID,
      sessionBID
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
