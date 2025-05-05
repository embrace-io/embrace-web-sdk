import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  session,
  type SpanSessionManager,
} from '../../../api-sessions/index.js';
import { setupTestTraceExporter } from '../../../testUtils/index.js';
import { EmbraceSpanSessionManager } from '../../../managers/index.js';
import { SpanSessionVisibilityInstrumentation } from './SpanSessionVisibilityInstrumentation.js';
import { KEY_EMB_SESSION_REASON_ENDED } from '../../../constants/index.js';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import type { VisibilityStateDocument } from '../../../common/index.js';

const { expect } = chai;

describe('SpanSessionVisibilityInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: SpanSessionVisibilityInstrumentation;
  let spanSessionManager: SpanSessionManager;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    spanSessionManager = new EmbraceSpanSessionManager();
    session.setGlobalSessionManager(spanSessionManager);
  });

  afterEach(() => {
    instrumentation.disable();
    memoryExporter.reset();
    sinon.restore();
  });

  it('should initialize', () => {
    instrumentation = new SpanSessionVisibilityInstrumentation();
    expect(instrumentation).to.be.instanceOf(
      SpanSessionVisibilityInstrumentation
    );
  });

  it('should start a session when visibility changes to visible', () => {
    instrumentation = new SpanSessionVisibilityInstrumentation();
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    window.dispatchEvent(new Event('visibilitychange'));
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
  });

  it('should end the previous a session and start a new one when visibility changes to visible', () => {
    instrumentation = new SpanSessionVisibilityInstrumentation();
    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    window.dispatchEvent(new Event('visibilitychange'));
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed'
    );

    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
  });

  it('should end a session when visibility is hidden and not start a new one by default', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'hidden',
    };

    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityDoc,
    });

    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    window.dispatchEvent(new Event('visibilitychange'));
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed'
    );

    void expect(spanSessionManager.getSessionSpan()).to.be.null;
  });

  it('should end a session when visibility is hidden and start a new one when background sessions are enabled', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'hidden',
    };

    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityDoc,
      backgroundSessions: true,
    });

    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    window.dispatchEvent(new Event('visibilitychange'));
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed'
    );

    void expect(spanSessionManager.getSessionSpan()).not.to.be.null;
  });
});
