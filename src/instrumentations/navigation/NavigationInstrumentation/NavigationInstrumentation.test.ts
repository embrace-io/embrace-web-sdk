import * as chai from 'chai';
import { NavigationInstrumentation } from './NavigationInstrumentation.js';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import {
  InMemoryDiagLogger,
  setupTestTraceExporter,
} from '../../../testUtils/index.js';
import {
  EMB_NAVIGATION_INSTRUMENTATIONS,
  KEY_EMB_INSTRUMENTATION,
} from '../../../constants/index.js';
import { EmbraceSpanSessionManager } from '../../../managers/index.js';
import { session } from '../../../api-sessions/index.js';

const { expect } = chai;

describe('NavigationInstrumentation', () => {
  let navigationInstrumentation: NavigationInstrumentation;
  let memoryExporter: InMemorySpanExporter;
  let diag: InMemoryDiagLogger;
  let spanSessionManager: EmbraceSpanSessionManager;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
    spanSessionManager = new EmbraceSpanSessionManager();
    session.setGlobalSessionManager(spanSessionManager);
  });

  it('should start and end route span when the route changes', () => {
    navigationInstrumentation = new NavigationInstrumentation({ diag });
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/1235',
    });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);

    const span = finishedSpans[0];
    expect(span.name).to.equal('/test/:id');
    expect(span.attributes).to.deep.equal({
      'emb.type': 'ux.view',
      'view.name': '/test/:id',
    });

    expect(diag.getDebugLogs()).to.be.deep.equal([
      'NavigationInstrumentation enabled, listening for navigation events.',
      'Starting route span for url: /test/123',
      'Ending route span for url: /test/123',
      'Starting route span for url: /test/1235',
    ]);
  });

  it('should start and end route span when the route changes with given instrumentationType', () => {
    navigationInstrumentation = new NavigationInstrumentation({ diag });
    navigationInstrumentation.setInstrumentationType(
      EMB_NAVIGATION_INSTRUMENTATIONS.Data
    );
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/1235',
    });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);

    const span = finishedSpans[0];
    expect(span.name).to.equal('/test/:id');
    expect(span.attributes).to.deep.equal({
      'emb.type': 'ux.view',
      'view.name': '/test/:id',
      [KEY_EMB_INSTRUMENTATION]: EMB_NAVIGATION_INSTRUMENTATIONS.Data,
    });
  });

  it('should clean up the path options from the route name if configured', () => {
    navigationInstrumentation = new NavigationInstrumentation({ diag });
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:time(hourly|daily|weekly|monthly)',
      url: '/test/hourly',
    });

    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/1235',
    });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);

    const span = finishedSpans[0];
    expect(span.name).to.equal('/test/:time');
    expect(span.attributes).to.deep.equal({
      'emb.type': 'ux.view',
      'view.name': '/test/:time',
    });
  });

  it('should not clean up the path options from the route name if configured', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      shouldCleanupPathOptionsFromRouteName: false,
    });
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:time(hourly|daily|weekly|monthly)',
      url: '/test/hourly',
    });

    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/1235',
    });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);

    const span = finishedSpans[0];
    expect(span.name).to.equal('/test/:time(hourly|daily|weekly|monthly)');
    expect(span.attributes).to.deep.equal({
      'emb.type': 'ux.view',
      'view.name': '/test/:time(hourly|daily|weekly|monthly)',
    });
  });

  it('should not start a new span if the route has not changed', () => {
    navigationInstrumentation = new NavigationInstrumentation({ diag });
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(0);

    expect(diag.getDebugLogs()).to.be.deep.equal([
      'NavigationInstrumentation enabled, listening for navigation events.',
      'Starting route span for url: /test/123',
    ]);
  });

  it('should be a no-op when not enabled', () => {
    navigationInstrumentation = new NavigationInstrumentation({ diag });
    navigationInstrumentation.disable();
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);
    // Start and end session to test that listeners are cleaned up
    spanSessionManager.startSessionSpan();
    spanSessionManager.endSessionSpan();

    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/1235',
    });

    // Only session span
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(1);

    expect(diag.getDebugLogs()).to.be.deep.equal([
      'NavigationInstrumentation enabled, listening for navigation events.',
      'NavigationInstrumentation disabled, stopped listening for navigation events.',
    ]);
  });

  it('should start and end route span when session ends', () => {
    spanSessionManager.startSessionSpan();

    navigationInstrumentation = new NavigationInstrumentation({ diag });
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    // Session span and route span
    expect(finishedSpans).to.have.lengthOf(2);

    // First span is the session span
    const span = finishedSpans[1];
    expect(span.name).to.equal('/test/:id');
    expect(span.attributes).to.deep.equal({
      'emb.type': 'ux.view',
      'view.name': '/test/:id',
    });

    expect(diag.getDebugLogs()).to.be.deep.equal([
      'NavigationInstrumentation enabled, listening for navigation events.',
      'Starting route span for url: /test/123',
      'Session ended, ending route span.',
      'Ending route span for url: /test/123',
    ]);
  });

  it('should start the route span when the session starts if it was previously ended', () => {
    spanSessionManager.startSessionSpan();

    navigationInstrumentation = new NavigationInstrumentation({ diag });
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

    spanSessionManager.endSessionSpan();

    // At this point we should have two spans: one for the session and one for the route
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(2);

    // Start and finish another session without changing the route
    spanSessionManager.startSessionSpan();
    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    // 2 sessions and 2 route spans
    expect(finishedSpans).to.have.lengthOf(4);

    // First route span
    let span = finishedSpans[1];
    expect(span.name).to.equal('/test/:id');
    expect(span.attributes).to.deep.equal({
      'emb.type': 'ux.view',
      'view.name': '/test/:id',
    });

    // Second route span
    span = finishedSpans[3];
    expect(span.name).to.equal('/test/:id');
    expect(span.attributes).to.deep.equal({
      'emb.type': 'ux.view',
      'view.name': '/test/:id',
    });

    expect(diag.getDebugLogs()).to.be.deep.equal([
      'NavigationInstrumentation enabled, listening for navigation events.',
      'Starting route span for url: /test/123',
      'Session ended, ending route span.',
      'Ending route span for url: /test/123',
      'Session started, starting route span.',
      'Starting route span for url: /test/123',
      'Session ended, ending route span.',
      'Ending route span for url: /test/123',
    ]);
  });
});
