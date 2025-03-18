import { trace, type TracerProvider } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider
} from '@opentelemetry/sdk-trace-web';
import { ATTR_SESSION_ID } from '@opentelemetry/semantic-conventions/incubating';
import * as chai from 'chai';
import {
  session,
  type SpanSessionManager
} from '../../../api-sessions/index.js';
import { KEY_EMB_SESSION_REASON_ENDED } from '../../../constants/attributes.js';
import { EmbraceSpanSessionManager } from '../EmbraceSpanSessionManager/index.js';
import { SpanSessionOnLoadInstrumentation } from './SpanSessionOnLoadInstrumentation.js';

const { expect } = chai;

describe('SpanSessionOnLoadInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let tracerProvider: TracerProvider;
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
    spanSessionManager = new EmbraceSpanSessionManager();
    session.setGlobalSessionManager(spanSessionManager);
  });

  afterEach(() => {
    spanSessionManager.endSessionSpan();
  });

  it('should start a new session when instantiated', () => {
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    new SpanSessionOnLoadInstrumentation();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
  });

  it('should end the current session when disabled', () => {
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    const instrumentation = new SpanSessionOnLoadInstrumentation();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
    const sessionID = spanSessionManager.getSessionId();
    instrumentation.disable();
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).to.have.property(
      KEY_EMB_SESSION_REASON_ENDED,
      'unknown'
    );
    expect(sessionSpan.attributes).to.have.property(ATTR_SESSION_ID, sessionID);
  });

  it('should start a new session when enabled', () => {
    const instrumentation = new SpanSessionOnLoadInstrumentation();
    instrumentation.disable();
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    instrumentation.enable();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
  });
});
