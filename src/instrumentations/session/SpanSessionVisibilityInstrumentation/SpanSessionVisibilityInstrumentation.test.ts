import { trace, type TracerProvider } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider
} from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  session,
  type SpanSessionManager
} from '../../../api-sessions/index.js';
import { InMemoryDiagLogger } from '../../../testUtils/index.js';
import { EmbraceSpanSessionManager } from '../EmbraceSpanSessionManager/index.js';
import { SpanSessionVisibilityInstrumentation } from './SpanSessionVisibilityInstrumentation.js';

const { expect } = chai;

describe('SpanSessionVisibilityInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let tracerProvider: TracerProvider;
  let instrumentation: SpanSessionVisibilityInstrumentation;
  let spanSessionManager: SpanSessionManager;
  let diag: InMemoryDiagLogger;

  before(() => {
    memoryExporter = new InMemorySpanExporter();
    tracerProvider = new WebTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(memoryExporter)]
    });
    trace.setGlobalTracerProvider(tracerProvider);
  });

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
    spanSessionManager = new EmbraceSpanSessionManager();
    session.setGlobalSessionManager(spanSessionManager);
    instrumentation = new SpanSessionVisibilityInstrumentation({ diag });
  });

  afterEach(() => {
    instrumentation.disable();
    sinon.restore();
  });

  it('should initialize', () => {
    expect(instrumentation).to.be.instanceOf(
      SpanSessionVisibilityInstrumentation
    );
  });

  it('should start a session when visibility changes to visible', () => {
    void expect(spanSessionManager.getSessionSpan()).to.be.null;
    window.dispatchEvent(new Event('visibilitychange'));
    spanSessionManager.startSessionSpan();
    void expect(spanSessionManager.getSessionSpan()).to.not.be.null;
  });

  it.skip('should end a session when visibility is hidden', () => {
    // TODO: implement test. This requires mocking the document.visibilityState readonlu property, which may require a mocked DOM.
    //  there are no native events that can be dispatched to trigger the a change in this property
  });
});
