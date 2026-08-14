import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import { setupTestTraceExporter } from '../../../tests/utils/index.ts';
import type { PageManager, Route } from '../../api-page/index.ts';
import {
  KEY_APP_SURFACE_LABEL,
  KEY_EMB_PAGE_ID,
  KEY_EMB_PAGE_PATH,
} from '../../constants/index.ts';
import { EmbracePageManager } from '../../managers/index.ts';
import { PageSpanProcessor } from './PageSpanProcessor.ts';

const { expect } = chai;

describe('PageSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let pageManager: PageManager;
  let tracer: Tracer;

  const mockRoute: Route = {
    path: '/products/:id',
    url: '/products/123',
  };

  before(() => {
    pageManager = new EmbracePageManager();
    memoryExporter = setupTestTraceExporter([
      new PageSpanProcessor({
        pageManager,
      }),
    ]);
    tracer = trace.getTracer('test-tracer');
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  it('should attach page attributes when span ends', () => {
    pageManager.setCurrentRoute(mockRoute);

    const span = tracer.startSpan('test-span-1');
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const readableSpan = finishedSpans[0]!;

    expect(readableSpan.attributes[KEY_EMB_PAGE_ID]).to.equal(
      pageManager.getCurrentPageId(),
    );
    expect(readableSpan.attributes[KEY_EMB_PAGE_PATH]).to.equal(
      '/products/:id',
    );
    void expect(readableSpan.attributes[KEY_APP_SURFACE_LABEL]).to.be.undefined;
  });

  it('should attach custom label when available', () => {
    pageManager.setCurrentRoute(mockRoute);
    pageManager.setPageLabel('SpanLabel');

    const span = tracer.startSpan('test-span-label');
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    const readableSpan = finishedSpans[finishedSpans.length - 1]!;

    expect(readableSpan.attributes[KEY_APP_SURFACE_LABEL]).to.equal(
      'SpanLabel',
    );
  });

  it('should not attach page attributes when route is null', () => {
    pageManager.clearCurrentRoute();
    const span = tracer.startSpan('test-span-2');
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const readableSpan = finishedSpans[0]!;

    void expect(readableSpan.attributes[KEY_EMB_PAGE_ID]).to.be.undefined;
    void expect(readableSpan.attributes[KEY_EMB_PAGE_PATH]).to.be.undefined;
  });

  it('should not override page attributes', () => {
    pageManager.setCurrentRoute(mockRoute);

    const span = tracer.startSpan('span-with-properties', {
      attributes: {
        [KEY_EMB_PAGE_ID]: 'some-other-page-id',
        [KEY_EMB_PAGE_PATH]: '/some/other/path',
      },
    });
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const readableSpan = finishedSpans[0]!;

    void expect(readableSpan.attributes[KEY_EMB_PAGE_ID]).to.be.equal(
      'some-other-page-id',
    );
    void expect(readableSpan.attributes[KEY_EMB_PAGE_PATH]).to.be.equal(
      '/some/other/path',
    );
  });

  it('should not override surface label attribute', () => {
    pageManager.setCurrentRoute(mockRoute);
    pageManager.setPageLabel('DefaultLabel');

    const span = tracer.startSpan('span-with-label', {
      attributes: {
        [KEY_APP_SURFACE_LABEL]: 'ExistingLabel',
      },
    });
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    const readableSpan = finishedSpans[finishedSpans.length - 1]!;

    expect(readableSpan.attributes[KEY_APP_SURFACE_LABEL]).to.be.equal(
      'ExistingLabel',
    );
  });

  it('should make sure forceFlush no-op does not fail', () => {
    const processor = new PageSpanProcessor({
      pageManager: new EmbracePageManager(),
    });

    expect(async () => {
      await processor.forceFlush();
    }).to.not.throw();
  });

  it('should make sure shutdown no-op does not fail', () => {
    const processor = new PageSpanProcessor({
      pageManager: new EmbracePageManager(),
    });

    expect(async () => {
      await processor.shutdown();
    }).to.not.throw();
  });
});
