import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import {
  InMemoryDiagLogger,
  setupTestStorage,
  setupTestTraceExporter,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../../tests/utils/index.ts';
import { session } from '../../../api-sessions/index.ts';
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
  let pageManager: EmbracePageManager;
  let userSessionManager: UserSessionManagerInternal;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
    pageManager = new EmbracePageManager();

    userSessionManager = new EmbraceUserSessionManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      perf: new OTelPerformanceManager(),
      storage: setupTestStorage(),
      visibilityDoc: window.document,
    });
    session.setGlobalUserSessionManager(userSessionManager);
  });

  const surfaceSpans = () =>
    memoryExporter
      .getFinishedSpans()
      .filter((s) => s.attributes['emb.type'] === 'ux.surface');

  it('should start a route span the first time a route is reported', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
    });

    pageManager.setCurrentRoute({ path: '/test/:id', url: '/test/123' });
    const pageId = pageManager.getCurrentPageId();

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

    pageManager.setCurrentRoute({ path: '/other', url: '/other' });

    const finishedSpans = surfaceSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].name).to.equal('/test/:id');
    expect(finishedSpans[0].attributes).to.deep.equal({
      'emb.type': 'ux.surface',
      'app.surface.name': '/test/:id',
      'app.surface.id': pageId,
    });

    expect(diag.getDebugLogs()).to.deep.equal([
      'NavigationInstrumentation enabled, listening for navigation events.',
      'Starting route span for url: /test/123',
      'Ending route span for url: /test/123',
      'Starting route span for url: /other',
    ]);
  });

  it('should not start a new span or log anything for a redundant report of the same route', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
    });

    pageManager.setCurrentRoute({ path: '/test/:id', url: '/test/123' });
    pageManager.setCurrentRoute({ path: '/test/:id', url: '/test/123' });

    pageManager.setCurrentRoute({ path: '/other', url: '/other' });

    expect(surfaceSpans()).to.have.lengthOf(1);
    expect(diag.getDebugLogs()).to.deep.equal([
      'NavigationInstrumentation enabled, listening for navigation events.',
      'Starting route span for url: /test/123',
      'Ending route span for url: /test/123',
      'Starting route span for url: /other',
    ]);
  });

  it('should rename the open span in place when the same url resolves to a different path', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
    });

    // A placeholder reported first (e.g. by EmbracePageManager on soft nav,
    // before react-router has resolved the template), then the real path
    // for the same url.
    pageManager.setCurrentRoute({
      path: '/products/123',
      url: '/products/123',
    });
    pageManager.setCurrentRoute({
      path: '/products/:id',
      url: '/products/123',
    });

    pageManager.setCurrentRoute({ path: '/other', url: '/other' });

    // Exactly one span for /products/123, correctly renamed — no spurious
    // extra span from the placeholder-to-resolved transition.
    const finishedSpans = surfaceSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].name).to.equal('/products/:id');
    expect(finishedSpans[0].attributes['app.surface.name']).to.equal(
      '/products/:id',
    );

    expect(diag.getDebugLogs()).to.deep.equal([
      'NavigationInstrumentation enabled, listening for navigation events.',
      'Starting route span for url: /products/123',
      'Resolved route span path to: /products/:id',
      'Ending route span for url: /products/123',
      'Starting route span for url: /other',
    ]);
  });

  it('should end the old span and start a new one immediately when the url changes, with no session-part boundary needed', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
    });

    pageManager.setCurrentRoute({ path: '/first', url: '/first' });
    expect(surfaceSpans()).to.have.lengthOf(0);

    pageManager.setCurrentRoute({ path: '/second', url: '/second' });
    expect(surfaceSpans()).to.have.lengthOf(1);

    pageManager.setCurrentRoute({ path: '/third', url: '/third' });
    const finishedSpans = surfaceSpans();
    expect(finishedSpans).to.have.lengthOf(2);
    expect(finishedSpans[0].name).to.equal('/first');
    expect(finishedSpans[1].name).to.equal('/second');
  });

  it('should clean up the path options from the route name if configured', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
    });

    pageManager.setCurrentRoute({
      path: '/test/:time(hourly|daily|weekly|monthly)/:type(typeA|typeB)',
      url: '/test/hourly',
    });
    pageManager.setCurrentRoute({ path: '/other', url: '/other' });

    const finishedSpans = surfaceSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].name).to.equal('/test/:time/:type');
  });

  it('should not clean up the path options from the route name if configured', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
      shouldCleanupPathOptionsFromRouteName: false,
    });

    pageManager.setCurrentRoute({
      path: '/test/:time(hourly|daily|weekly|monthly)',
      url: '/test/hourly',
    });
    pageManager.setCurrentRoute({ path: '/other', url: '/other' });

    const finishedSpans = surfaceSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].name).to.equal(
      '/test/:time(hourly|daily|weekly|monthly)',
    );
  });

  it('should apply path-options cleanup through the rename path too', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
    });

    pageManager.setCurrentRoute({ path: '/test/hourly', url: '/test/hourly' });
    pageManager.setCurrentRoute({
      path: '/test/:time(hourly|daily)',
      url: '/test/hourly',
    });
    pageManager.setCurrentRoute({ path: '/other', url: '/other' });

    const finishedSpans = surfaceSpans();
    expect(finishedSpans[0].name).to.equal('/test/:time');
  });

  it('should be a no-op when not enabled', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
    });
    navigationInstrumentation.disable();

    pageManager.setCurrentRoute({ path: '/test/:id', url: '/test/123' });
    pageManager.setCurrentRoute({ path: '/other', url: '/other' });

    expect(surfaceSpans()).to.have.lengthOf(0);
  });

  it('should end an open route span when disabled', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
    });

    pageManager.setCurrentRoute({ path: '/test/:id', url: '/test/123' });
    expect(surfaceSpans()).to.have.lengthOf(0);

    navigationInstrumentation.disable();

    const finishedSpans = surfaceSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].name).to.equal('/test/:id');
  });

  it('should end an open route span when the session part ends, even without a url change', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
    });

    userSessionManager.startSessionPartInternal({ reason: 'init' });
    pageManager.setCurrentRoute({ path: '/test/:id', url: '/test/123' });
    expect(surfaceSpans()).to.have.lengthOf(0);

    userSessionManager.endSessionPartInternal({ reason: 'background' });

    const finishedSpans = surfaceSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].name).to.equal('/test/:id');

    expect(diag.getDebugLogs()).to.include('Session ended, ending route span.');
  });

  it('should not throw when a session part ends with no open route span', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
    });

    expect(() => {
      userSessionManager.startSessionPartInternal({ reason: 'init' });
      userSessionManager.endSessionPartInternal({ reason: 'background' });
    }).to.not.throw();

    expect(surfaceSpans()).to.have.lengthOf(0);
  });

  it('should work correctly after disable() then enable()', () => {
    navigationInstrumentation = new NavigationInstrumentation({
      diag,
      pageManager,
    });

    pageManager.setCurrentRoute({ path: '/first', url: '/first' });

    navigationInstrumentation.disable();
    navigationInstrumentation.enable();

    pageManager.setCurrentRoute({ path: '/second', url: '/second' });
    pageManager.setCurrentRoute({ path: '/third', url: '/third' });

    expect(surfaceSpans()).to.have.lengthOf(2);
  });
});
