import * as chai from 'chai';
import * as sinon from 'sinon';
import type { SpanSessionManager } from '../../../api-sessions/index.js';
import { session } from '../../../api-sessions/index.js';
import { setupTestTraceExporter } from '../../../testUtils/index.js';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSpanSessionManager,
} from '../../../managers/index.js';
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
    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });
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

  it('should end the previous a session and start a new one when visibility changes to visible', async () => {
    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityWaitTimeMs: 1,
    });
    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;

    window.dispatchEvent(new Event('visibilitychange'));
    // Wait for _onVisibilityChange to be called after  visibilityWaitTimeMs
    await new Promise(r => setTimeout(r, 10));

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed'
    );

    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
  });

  it('should end a session when visibility is hidden and not start a new one by default', async () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'hidden',
    };

    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityWaitTimeMs: 1,
      visibilityDoc,
    });

    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;

    window.dispatchEvent(new Event('visibilitychange'));
    // Wait for _onVisibilityChange to be called after  visibilityWaitTimeMs
    await new Promise(r => setTimeout(r, 10));

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed'
    );

    void expect(spanSessionManager.getSessionSpan()).to.be.null;
  });

  it('should end a session when visibility is hidden and start a new one when background sessions are enabled', async () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'hidden',
    };

    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityWaitTimeMs: 1,
      visibilityDoc,
      backgroundSessions: true,
    });

    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;

    window.dispatchEvent(new Event('visibilitychange'));
    // Wait for _onVisibilityChange to be called after  visibilityWaitTimeMs
    await new Promise(r => setTimeout(r, 10));

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
