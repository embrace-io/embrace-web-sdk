import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import type { PageManager, Route } from '../../api-page/index.ts';
import { KEY_EMB_PAGE_ID, KEY_EMB_PAGE_PATH } from '../../constants/index.ts';
import { EmbracePageManager } from '../../managers/index.ts';
import { setupTestTraceExporter } from '../../testUtils/index.ts';
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
    const readableSpan = finishedSpans[0];

    expect(readableSpan.attributes[KEY_EMB_PAGE_ID]).to.equal(
      pageManager.getCurrentPageId(),
    );
    expect(readableSpan.attributes[KEY_EMB_PAGE_PATH]).to.equal(
      '/products/:id',
    );
  });

  it('should not attach page attributes when route is null', () => {
    pageManager.clearCurrentRoute();
    const span = tracer.startSpan('test-span-2');
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const readableSpan = finishedSpans[0];

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
    const readableSpan = finishedSpans[0];

    void expect(readableSpan.attributes[KEY_EMB_PAGE_ID]).to.be.equal(
      'some-other-page-id',
    );
    void expect(readableSpan.attributes[KEY_EMB_PAGE_PATH]).to.be.equal(
      '/some/other/path',
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
