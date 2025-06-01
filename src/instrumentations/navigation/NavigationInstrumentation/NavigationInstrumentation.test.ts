import * as chai from 'chai';
import { NavigationInstrumentation } from './NavigationInstrumentation.js';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import {
  InMemoryDiagLogger,
  setupTestTraceExporter,
} from '../../../testUtils/index.js';

const { expect } = chai;

describe('NavigationInstrumentation', () => {
  let navigationInstrumentation: NavigationInstrumentation;
  let memoryExporter: InMemorySpanExporter;
  let diag: InMemoryDiagLogger;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
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

    navigationInstrumentation.setCurrentRoute({
      path: '/test/:id',
      url: '/test/1235',
    });

    expect(memoryExporter.getFinishedSpans()).to.have.lengthOf(0);

    expect(diag.getDebugLogs()).to.be.deep.equal([
      'NavigationInstrumentation enabled, listening for navigation events.',
      'NavigationInstrumentation disabled, stopped listening for navigation events.',
    ]);
  });
});
