import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { setupTestTraceExporter } from '../../../tests/utils/index.ts';
import type { URLDocument } from '../../common/index.ts';
import { KEY_BROWSER_URL_FULL } from '../../constants/index.ts';
import { BrowserSpanProcessor } from './BrowserSpanProcessor.ts';

const { expect } = chai;

const urlDocument: URLDocument = {
  URL: 'https://example.com/products/123',
};

describe('BrowserSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let tracer: Tracer;

  before(() => {
    memoryExporter = setupTestTraceExporter([
      new BrowserSpanProcessor({ urlDocument }),
    ]);
    tracer = trace.getTracer('test-tracer');
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  it('should attach browser.url.full when span ends', () => {
    const span = tracer.startSpan('test-span');
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const readableSpan = finishedSpans[0];

    expect(readableSpan.attributes[KEY_BROWSER_URL_FULL]).to.equal(
      urlDocument.URL,
    );
  });

  it('should reflect the url at span end time', () => {
    const mutableDocument: URLDocument = { URL: 'https://example.com/page-1' };
    const exporter = setupTestTraceExporter([
      new BrowserSpanProcessor({ urlDocument: mutableDocument }),
    ]);
    const localTracer = trace.getTracer('test-tracer-mutable');

    const span = localTracer.startSpan('test-span');
    mutableDocument.URL = 'https://example.com/page-2';
    span.end();

    const finishedSpans = exporter.getFinishedSpans();
    const readableSpan = finishedSpans[finishedSpans.length - 1];

    expect(readableSpan.attributes[KEY_BROWSER_URL_FULL]).to.equal(
      'https://example.com/page-2',
    );
  });

  it('should make sure forceFlush no-op does not fail', () => {
    const processor = new BrowserSpanProcessor({ urlDocument });

    expect(async () => {
      await processor.forceFlush();
    }).to.not.throw();
  });

  it('should make sure shutdown no-op does not fail', () => {
    const processor = new BrowserSpanProcessor({ urlDocument });

    expect(async () => {
      await processor.shutdown();
    }).to.not.throw();
  });
});
