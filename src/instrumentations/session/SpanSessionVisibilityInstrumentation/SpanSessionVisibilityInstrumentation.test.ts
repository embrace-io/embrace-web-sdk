import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import type { SinonStub } from 'sinon';
import sinon from 'sinon';
import type { SpanSessionManager } from '../../../api-sessions/index.js';
import { session } from '../../../api-sessions/index.js';
import type { VisibilityStateDocument } from '../../../common/index.js';
import {
  KEY_EMB_SESSION_REASON_ENDED,
  KEY_EMB_SESSION_REASON_STARTED,
} from '../../../constants/index.js';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSpanSessionManager,
} from '../../../managers/index.js';
import { EmbraceSessionBatchedSpanProcessor } from '../../../processors/index.js';
import { setupTestTraceExporter } from '../../../testUtils/index.js';
import type { PerformanceManager } from '../../../utils/index.js';
import { OTelPerformanceManager } from '../../../utils/index.js';
import { SpanSessionVisibilityInstrumentation } from './SpanSessionVisibilityInstrumentation.js';

const { expect } = chai;

// Helper function to create mock EmbraceProcessor
const createMockEmbraceProcessor = (): EmbraceSessionBatchedSpanProcessor => {
  const stub = sinon.createStubInstance(EmbraceSessionBatchedSpanProcessor);
  stub.getPendingSpansCount.returns(0);

  return stub;
};

describe('SpanSessionVisibilityInstrumentation', () => {
  let nowStub: SinonStub;
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: SpanSessionVisibilityInstrumentation;
  let spanSessionManager: SpanSessionManager;
  let perf: PerformanceManager;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    nowStub = sinon.stub().returns(0);
    perf = new OTelPerformanceManager({
      timeOrigin: 0,
      now: nowStub,
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
    instrumentation = new SpanSessionVisibilityInstrumentation();
    expect(instrumentation).to.be.instanceOf(
      SpanSessionVisibilityInstrumentation,
    );
  });

  it('should start a session when visibility changes to visible', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'hidden',
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

  it('should end a session when visibility changes to hidden and not start a new one by default', async () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
    };

    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityWaitTimeMs: 1,
      visibilityDoc,
    });

    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;

    visibilityDoc.visibilityState = 'hidden';
    window.dispatchEvent(new Event('visibilitychange'));
    // Wait for _onVisibilityChange to be called after visibilityWaitTimeMs
    await new Promise((r) => setTimeout(r, 10));

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

  it('should end a session when visibility changes to hidden and start a new one when background sessions are enabled', async () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
    };

    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityWaitTimeMs: 1,
      visibilityDoc,
      backgroundSessions: true,
    });

    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;

    visibilityDoc.visibilityState = 'hidden';
    window.dispatchEvent(new Event('visibilitychange'));
    // Wait for _onVisibilityChange to be called after visibilityWaitTimeMs
    await new Promise((r) => setTimeout(r, 100));

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

  it('should not end a session when visibility changes to hidden and visible within less than visibilityWaitTimeMs', async () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
    };

    instrumentation = new SpanSessionVisibilityInstrumentation({
      visibilityWaitTimeMs: 1000,
      visibilityDoc,
    });

    spanSessionManager.startSessionSpan();
    const sessionSpan = spanSessionManager.getSessionSpan();
    void expect(sessionSpan).to.not.be.null;

    // Trigger hidden and visible events within less than visibilityWaitTimeMs
    visibilityDoc.visibilityState = 'hidden';
    window.dispatchEvent(new Event('visibilitychange'));
    // Wait some time less than 1s and trigger visible again.
    await new Promise((r) => setTimeout(r, 10));
    visibilityDoc.visibilityState = 'visible';
    window.dispatchEvent(new Event('visibilitychange'));

    // No session should have ended:
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(0);

    // The session span should still be the same as before
    void expect(spanSessionManager.getSessionSpan()).to.equal(sessionSpan);
  });

  it('should not end a session when its duration is less than limitedSessionMaxDurationMs', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
    };

    // Mock implementation of EmbraceProcessor
    const embraceSpanProcessor = createMockEmbraceProcessor();

    instrumentation = new SpanSessionVisibilityInstrumentation(
      {
        limitedSessionMaxDurationMs: 1000,
        visibilityDoc,
        perf,
      },
      embraceSpanProcessor,
    );

    spanSessionManager.startSessionSpan();

    // While duration of the session is less than limitedSessionMaxDurationMs, no session should have ended
    nowStub.returns(400);
    visibilityDoc.visibilityState = 'hidden';
    window.dispatchEvent(new Event('visibilitychange'));
    nowStub.returns(600);
    visibilityDoc.visibilityState = 'visible';
    window.dispatchEvent(new Event('visibilitychange'));
    nowStub.returns(800);
    visibilityDoc.visibilityState = 'hidden';
    window.dispatchEvent(new Event('visibilitychange'));
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

    // Once the duration of the session is more than limitedSessionMaxDurationMs, the session should end
    nowStub.returns(1100);
    visibilityDoc.visibilityState = 'visible';
    window.dispatchEvent(new Event('visibilitychange'));
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed',
    );

    // There should be a breadcrumb for each visibility change that did not end the session
    expect(sessionSpan.events).to.have.lengthOf(3);
    expect(sessionSpan.events[0].name).to.equal('emb-breadcrumb');
    expect(sessionSpan.events[0].attributes).to.have.property(
      'message',
      'Tab visibility changed to hidden',
    );
    expect(sessionSpan.events[1].name).to.equal('emb-breadcrumb');
    expect(sessionSpan.events[1].attributes).to.have.property(
      'message',
      'Tab visibility changed to visible',
    );
    expect(sessionSpan.events[2].name).to.equal('emb-breadcrumb');
    expect(sessionSpan.events[2].attributes).to.have.property(
      'message',
      'Tab visibility changed to hidden',
    );
  });

  it('should end a session when its duration is less than limitedSessionMaxDurationMs if there has been user interactions', () => {
    const visibilityDoc: VisibilityStateDocument = {
      visibilityState: 'visible',
    };

    // Mock implementation of EmbraceProcessor
    const embraceSpanProcessor = createMockEmbraceProcessor();

    instrumentation = new SpanSessionVisibilityInstrumentation(
      {
        limitedSessionMaxDurationMs: 1000,
        visibilityDoc,
        perf,
      },
      embraceSpanProcessor,
    );

    spanSessionManager.startSessionSpan();

    // The duration of the session is less than limitedSessionMaxDurationMs but there's been a user interaction, the session should end
    window.dispatchEvent(new Event('mousedown'));
    nowStub.returns(400);
    visibilityDoc.visibilityState = 'hidden';
    window.dispatchEvent(new Event('visibilitychange'));
    let finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    let sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed',
    );
    memoryExporter.reset();

    spanSessionManager.startSessionSpan();

    // User activity should be reset for the new session so it should not end if its duration is less than limitedSessionMaxDurationMs
    nowStub.returns(800);
    visibilityDoc.visibilityState = 'hidden';
    window.dispatchEvent(new Event('visibilitychange'));
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

    // Limited session should then be ended as normal once its duration passes limitedSessionMaxDurationMs
    nowStub.returns(1800);
    visibilityDoc.visibilityState = 'visible';
    window.dispatchEvent(new Event('visibilitychange'));
    finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'state_changed',
    );

    expect(sessionSpan.events).to.have.lengthOf(1);
    expect(sessionSpan.events[0].name).to.equal('emb-breadcrumb');
    expect(sessionSpan.events[0].attributes).to.have.property(
      'message',
      'Tab visibility changed to hidden',
    );
  });
});
