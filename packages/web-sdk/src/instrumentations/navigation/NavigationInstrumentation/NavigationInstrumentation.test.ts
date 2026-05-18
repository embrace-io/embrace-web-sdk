import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import {
  InMemoryDiagLogger,
  setupTestStorage,
  setupTestTraceExporter,
} from '../../../../tests/utils/index.ts';
import { page } from '../../../api-page/index.ts';
import { session } from '../../../api-sessions/index.ts';
import { EMB_NAVIGATION_INSTRUMENTATIONS } from '../../../constants/index.ts';
import type { UserSessionManagerInternal } from '../../../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbracePageManager,
  EmbraceUserSessionManager,
} from '../../../managers/index.ts';
import { OTelPerformanceManager } from '../../../utils/index.ts';
import { NavigationInstrumentation } from './NavigationInstrumentation.ts';

const { expect } = chai;

describe('NavigationInstrumentation', () => {
  let navigationInstrumentation: NavigationInstrumentation;
  let memoryExporter: InMemorySpanExporter;
  let diag: InMemoryDiagLogger;
  let userSessionManager: UserSessionManagerInternal;
  let pageManager: EmbracePageManager;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();

    userSessionManager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      perf: new OTelPerformanceManager(),
      storage: setupTestStorage(),
      visibilityDoc: window.document,
    });
    session.setGlobalUserSessionManager(userSessionManager);

    pageManager = new EmbracePageManager();
    page.setGlobalPageManager(pageManager);
  });

  it('should start and end route span when the route changes', () => {
    navigationInstrumentation = new NavigationInstrumentation({ diag });
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });
    const pageId = page.getCurrentPageId();

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
      'emb.instrumentation': 'manual',
      'emb.type': 'ux.surface',
      'app.surface.name': '/test/:id',
      'app.surface.id': pageId,
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
      EMB_NAVIGATION_INSTRUMENTATIONS.Data,
    );
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });
    const pageId = page.getCurrentPageId();

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
      'emb.instrumentation': EMB_NAVIGATION_INSTRUMENTATIONS.Data,
      'emb.type': 'ux.surface',
      'app.surface.name': '/test/:id',
      'app.surface.id': pageId,
    });
  });

  it('should clean up the path options from the route name if configured', () => {
    navigationInstrumentation = new NavigationInstrumentation({ diag });
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:time(hourly|daily|weekly|monthly)/:type(typeA|typeB)',
      url: '/test/hourly',
    });
    const pageId = page.getCurrentPageId();

    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/1235',
    });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);

    const span = finishedSpans[0];
    expect(span.name).to.equal('/test/:time/:type');
    expect(span.attributes).to.deep.equal({
      'emb.instrumentation': 'manual',
      'emb.type': 'ux.surface',
      'app.surface.name': '/test/:time/:type',
      'app.surface.id': pageId,
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
    const pageId = page.getCurrentPageId();

    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/1235',
    });

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);

    const span = finishedSpans[0];
    expect(span.name).to.equal('/test/:time(hourly|daily|weekly|monthly)');
    expect(span.attributes).to.deep.equal({
      'emb.instrumentation': 'manual',
      'emb.type': 'ux.surface',
      'app.surface.name': '/test/:time(hourly|daily|weekly|monthly)',
      'app.surface.id': pageId,
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
    userSessionManager.startSessionPartInternal('init');
    userSessionManager.endSessionPartInternal('inactivity');

    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/1235',
    });

    // Only session part span
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(1);

    expect(diag.getDebugLogs()).to.be.deep.equal([
      'NavigationInstrumentation enabled, listening for navigation events.',
      'NavigationInstrumentation disabled, stopped listening for navigation events.',
    ]);
  });

  it('should start and end route span when session part ends', () => {
    userSessionManager.startSessionPartInternal('init');

    navigationInstrumentation = new NavigationInstrumentation({ diag });
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

    userSessionManager.endSessionPartInternal('inactivity');

    const finishedSpans = memoryExporter.getFinishedSpans();
    // Session part span and route span
    expect(finishedSpans).to.have.lengthOf(2);

    // First span is the session part span
    const span = finishedSpans[0];
    expect(span.name).to.equal('/test/:id');
    expect(span.attributes).to.deep.equal({
      'emb.instrumentation': 'manual',
      'emb.type': 'ux.surface',
      'app.surface.name': '/test/:id',
      'app.surface.id': page.getCurrentPageId(),
    });

    expect(diag.getDebugLogs()).to.be.deep.equal([
      'NavigationInstrumentation enabled, listening for navigation events.',
      'Starting route span for url: /test/123',
      'Session ended, ending route span.',
      'Ending route span for url: /test/123',
    ]);
  });

  it('should start the route span when the session starts if it was previously ended', () => {
    userSessionManager.startSessionPartInternal('init');

    navigationInstrumentation = new NavigationInstrumentation({ diag });
    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

    userSessionManager.endSessionPartInternal('inactivity');

    // At this point we should have two spans: one for the session and one for the route
    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(2);

    // Start and finish another session without changing the route
    userSessionManager.startSessionPartInternal('init');
    userSessionManager.endSessionPartInternal('inactivity');

    const finishedSpans = memoryExporter.getFinishedSpans();
    // 2 sessions and 2 route spans
    expect(finishedSpans).to.have.lengthOf(4);

    // First route span
    let span = finishedSpans[0];
    expect(span.name).to.equal('/test/:id');
    expect(span.attributes).to.deep.equal({
      'emb.instrumentation': 'manual',
      'emb.type': 'ux.surface',
      'app.surface.name': '/test/:id',
      'app.surface.id': page.getCurrentPageId(),
    });

    // Second route span
    span = finishedSpans[2];
    expect(span.name).to.equal('/test/:id');
    expect(span.attributes).to.deep.equal({
      'emb.instrumentation': 'manual',
      'emb.type': 'ux.surface',
      'app.surface.name': '/test/:id',
      'app.surface.id': page.getCurrentPageId(),
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

  it('should work correctly after disable() then enable()', () => {
    navigationInstrumentation = new NavigationInstrumentation({ diag });
    userSessionManager.startSessionPartInternal('init');

    navigationInstrumentation.setCurrentRoute({
      path: '/first',
      url: '/first',
    });

    navigationInstrumentation.disable();
    navigationInstrumentation.enable();

    navigationInstrumentation.setCurrentRoute({
      path: '/second',
      url: '/second',
    });

    userSessionManager.endSessionPartInternal('inactivity');

    const finishedSpans = memoryExporter.getFinishedSpans();
    const navigationSpans = finishedSpans.filter(
      (s) => s.attributes['emb.type'] === 'ux.surface',
    );

    expect(navigationSpans).to.have.lengthOf(2);
  });
});
