import * as chai from 'chai';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import { setupTestTraceExporter } from '../../testUtils/index.js';
import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { PageSpanProcessor } from './PageSpanProcessor.js';
import type { PageProvider } from './types.js';
import type { Route } from '../../api-page/index.js';
import { KEY_EMB_PAGE_ID, KEY_EMB_PAGE_PATH } from '../../constants/index.js';

const { expect } = chai;

describe('PageSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let pageProvider: PageProvider;
  let tracer: Tracer;

  const mockRoute: Route = {
    path: '/products/:id',
    url: '/products/123',
  };

  before(() => {
    pageProvider = {
      getCurrentPageId: () => 'test-page-id',
      getCurrentRoute: () => mockRoute,
    };
    memoryExporter = setupTestTraceExporter([
      new PageSpanProcessor({
        pageProvider,
      }),
    ]);
    tracer = trace.getTracer('test-tracer');
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  it('should attach page attributes when span ends', () => {
    const span = tracer.startSpan('test-span');
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const readableSpan = finishedSpans[0];

    expect(readableSpan.attributes[KEY_EMB_PAGE_ID]).to.equal('test-page-id');
    expect(readableSpan.attributes[KEY_EMB_PAGE_PATH]).to.equal(
      '/products/:id'
    );
  });

  it('should not attach page attributes when route is null', () => {
    pageProvider.getCurrentRoute = () => null;

    const span = tracer.startSpan('test-span');
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const readableSpan = finishedSpans[0];

    void expect(readableSpan.attributes[KEY_EMB_PAGE_ID]).to.be.undefined;
    void expect(readableSpan.attributes[KEY_EMB_PAGE_PATH]).to.be.undefined;
  });

  it('should make sure forceFlush no-op does not fail', () => {
    const processor = new PageSpanProcessor({
      pageProvider,
    });

    expect(async () => {
      await processor.forceFlush();
    }).to.not.throw();
  });

  it('should make sure shutdown no-op does not fail', () => {
    const processor = new PageSpanProcessor({
      pageProvider,
    });

    expect(async () => {
      await processor.shutdown();
    }).to.not.throw();
  });
});
