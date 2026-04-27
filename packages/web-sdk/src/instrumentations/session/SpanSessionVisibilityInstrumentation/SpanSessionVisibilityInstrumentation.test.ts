import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import sinon from 'sinon';
import { setupTestTraceExporter } from '../../../../tests/utils/index.ts';
import type { SpanSessionManager } from '../../../api-sessions/index.ts';
import { session } from '../../../api-sessions/index.ts';
import type { VisibilityStateDocument } from '../../../common/index.ts';
import {
  KEY_EMB_SESSION_REASON_ENDED,
  KEY_EMB_SESSION_REASON_STARTED,
} from '../../../constants/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSpanSessionManager,
} from '../../../managers/index.ts';
import { OTelPerformanceManager } from '../../../utils/index.ts';
import { SpanSessionVisibilityInstrumentation } from './SpanSessionVisibilityInstrumentation.ts';

const { expect } = chai;

describe('SpanSessionVisibilityInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: SpanSessionVisibilityInstrumentation;
  let spanSessionManager: SpanSessionManager;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    const perf = new OTelPerformanceManager({
      timeOrigin: 0,
      now: sinon.stub().returns(0),
    });
    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      perf,
    });
    session.setGlobalSessionManager(spanSessionManager);
  });

  afterEach(() => {
    instrumentation.disable();
    memoryExporter.reset();
    sinon.restore();
  });

  it('should initialize', () => {
    instrumentation = new SpanSessionVisibilityInstrumentation({});
    expect(instrumentation).to.be.instanceOf(
      SpanSessionVisibilityInstrumentation,
    );
  });

  it('should start a session when visibility changes to visible', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'hidden',
      hasFocus: () => false,
    };
    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityDoc,
    });

    void expect(spanSessionManager.getSessionSpan()).to.be.null;

    visibilityDoc.visibilityState = 'visible';
    window.dispatchEvent(new Event('visibilitychange'));

    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_STARTED,
      'visible',
    );
  });

  it('should end the previous a session and start a new one when visibility changes to visible', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'hidden',
      hasFocus: () => false,
    };

    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityDoc,
    });
    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;

    visibilityDoc.visibilityState = 'visible';
    window.dispatchEvent(new Event('visibilitychange'));

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed',
    );

    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
  });

  it('should synchronously end a session on hidden with default config and not start a new one', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
      hasFocus: () => true,
    };

    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityDoc,
    });

    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;

    visibilityDoc.visibilityState = 'hidden';
    window.dispatchEvent(new Event('visibilitychange'));

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed',
    );

    void expect(spanSessionManager.getSessionSpan()).to.be.null;
  });

  it('should end a session when visibility changes to hidden and start a new one when background sessions are enabled and no visibility wait time configured', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
      hasFocus: () => true,
    };

    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityDoc,
      backgroundSessions: true,
    });

    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;

    visibilityDoc.visibilityState = 'hidden';
    window.dispatchEvent(new Event('visibilitychange'));

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed',
    );

    void expect(spanSessionManager.getSessionSpan()).not.to.be.null;
  });

  it('should end a session when visibility changes to hidden and start a new one when background sessions are enabled', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
      hasFocus: () => true,
    };

    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityDoc,
      backgroundSessions: true,
    });

    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;

    visibilityDoc.visibilityState = 'hidden';
    window.dispatchEvent(new Event('visibilitychange'));

    let finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    let sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed',
    );

    void expect(spanSessionManager.getSessionSpan()).not.to.be.null;

    memoryExporter.reset();
    spanSessionManager.endSessionSpan();
    finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_STARTED,
      'hidden',
    );
  });
});
