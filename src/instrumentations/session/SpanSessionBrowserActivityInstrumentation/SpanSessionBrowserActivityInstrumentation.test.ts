import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  session,
  type SpanSessionManager,
} from '../../../api-sessions/index.js';
import { KEY_EMB_SESSION_REASON_ENDED } from '../../../constants/attributes.js';
import {
  InMemoryDiagLogger,
  setupTestTraceExporter,
} from '../../../testUtils/index.js';
import { EmbraceSpanSessionManager } from '../../../managers/index.js';
import { TIMEOUT_TIME, WINDOW_USER_EVENTS } from './constants.js';
import { SpanSessionBrowserActivityInstrumentation } from './SpanSessionBrowserActivityInstrumentation.js';

const { expect } = chai;

describe('SpanSessionBrowserActivityInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: SpanSessionBrowserActivityInstrumentation;
  let clock: sinon.SinonFakeTimers;
  let diag: InMemoryDiagLogger;
  let spanSessionManager: SpanSessionManager;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    clock = sinon.useFakeTimers();
    diag = new InMemoryDiagLogger();
    spanSessionManager = new EmbraceSpanSessionManager();
    session.setGlobalSessionManager(spanSessionManager);
  });

  afterEach(() => {
    clock.restore();
    instrumentation.disable();
  });

  it('should not start a new session when instantiated', () => {
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    instrumentation = new SpanSessionBrowserActivityInstrumentation({ diag });
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
  });

  describe('should start a new session when activity is detected', () => {
    WINDOW_USER_EVENTS.forEach(event => {
      it(`on ${event}`, () => {
        void expect(spanSessionManager.getSessionSpan()).to.be.null;
        instrumentation = new SpanSessionBrowserActivityInstrumentation({
          diag,
        });
        window.dispatchEvent(new Event(event));
        void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
        expect(diag.getDebugLogs()).to.have.lengthOf(1);
        expect(diag.getDebugLogs()[0]).to.equal('Activity detected');
      });
    });
  });
  it('should end the current session when inactivity is detected', () => {
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    instrumentation = new SpanSessionBrowserActivityInstrumentation({
      diag,
    });
    const anySupportedEvent = WINDOW_USER_EVENTS[0];
    window.dispatchEvent(new Event(anySupportedEvent));
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    const sessionID = spanSessionManager.getSessionId();
    // the session should still be active until TIMEOUT_TIME
    clock.tick(TIMEOUT_TIME - 1);
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    // the session should end after TIMEOUT_TIME
    clock.tick(1);
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    expect(diag.getDebugLogs()).to.have.lengthOf(2);
    expect(diag.getDebugLogs()[0]).to.equal('Activity detected');
    expect(diag.getDebugLogs()[1]).to.equal('Inactivity detected');
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'inactivity'
    );
    expect(sessionSpan.attributes).to.have.property(ATTR_SESSION_ID, sessionID);
  });
  //
  it('should reset the inactivity timeout window on activity', () => {
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    instrumentation = new SpanSessionBrowserActivityInstrumentation({
      diag,
    });
    const anySupportedEvent = WINDOW_USER_EVENTS[0];
    window.dispatchEvent(new Event(anySupportedEvent));
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    const sessionID = spanSessionManager.getSessionId();
    // the session should still be active until TIMEOUT_TIME
    clock.tick(TIMEOUT_TIME - 1);
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    // trigger activity
    const anyOtherSupportedEvent = WINDOW_USER_EVENTS[1];
    window.dispatchEvent(new Event(anyOtherSupportedEvent));
    // the session should NOT end after TIMEOUT_TIME since there was activity
    clock.tick(1);
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    // the session should end after another TIMEOUT_TIME window of inactivity
    clock.tick(TIMEOUT_TIME);
    expect(diag.getDebugLogs()).to.have.lengthOf(3);
    expect(diag.getDebugLogs()[0]).to.equal('Activity detected');
    expect(diag.getDebugLogs()[1]).to.equal('Activity detected');
    expect(diag.getDebugLogs()[2]).to.equal('Inactivity detected');
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'inactivity'
    );
    expect(sessionSpan.attributes).to.have.property(ATTR_SESSION_ID, sessionID);
  });

  it('should NOT track activity if disabled', () => {
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    instrumentation = new SpanSessionBrowserActivityInstrumentation({
      diag,
    });
    instrumentation.disable();
    const anySupportedEvent = WINDOW_USER_EVENTS[0];
    window.dispatchEvent(new Event(anySupportedEvent));
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
  });

  it('should NOT track activity or inactivity anymore if disabled after being enabled', () => {
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    instrumentation = new SpanSessionBrowserActivityInstrumentation({
      diag,
    });
    const anySupportedEvent = WINDOW_USER_EVENTS[0];
    window.dispatchEvent(new Event(anySupportedEvent));
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    instrumentation.disable();
    clock.tick(TIMEOUT_TIME);
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
  });
});
