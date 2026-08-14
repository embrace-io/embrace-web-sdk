import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
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
    urlDocument.URL = 'https://example.com/products/123';
  });

  it('should attach browser.url.full when span ends', () => {
    const span = tracer.startSpan('test-span');
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const readableSpan = finishedSpans[0]!;

    expect(readableSpan.attributes[KEY_BROWSER_URL_FULL]).to.equal(
      'https://example.com/products/123',
    );
  });

  it('should reflect the url at span end time', () => {
    const span = tracer.startSpan('test-span');
    urlDocument.URL = 'https://example.com/page-2';
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const readableSpan = finishedSpans[0]!;

    expect(readableSpan.attributes[KEY_BROWSER_URL_FULL]).to.equal(
      'https://example.com/page-2',
    );
  });

  it('should not override an existing browser.url.full attribute', () => {
    const span = tracer.startSpan('test-span');
    span.setAttribute(KEY_BROWSER_URL_FULL, 'https://existing.com/path');
    span.end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);

    expect(finishedSpans[0]!.attributes[KEY_BROWSER_URL_FULL]).to.equal(
      'https://existing.com/path',
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
