import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { setupTestTraceExporter } from '../../../tests/utils/index.ts';
import { SpanScrubProcessor } from './SpanScrubProcessor.ts';

const { expect } = chai;

describe('SpanScrubProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let tracer: Tracer;

  before(() => {
    const attributeScrubbers = [
      { key: 'my-attr1', scrub: (_value: string) => 'SCRUBBED!' },
      { key: 'my-attr2', scrub: (_value: string) => '*****' },
    ];

    memoryExporter = setupTestTraceExporter([
      new SpanScrubProcessor({ attributeScrubbers }),
    ]);
    tracer = trace.getTracer('test-tracer');
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  it('should apply the scrubbers to the relevant attributes on emitted spans', () => {
    tracer
      .startSpan('span-1', {
        attributes: {
          'my-attr1': 'value1',
          'my-attr2': 'value2',
          'my-attr3': 'value3',
        },
      })
      .end();

    tracer
      .startSpan('span-2', {
        attributes: {
          'my-attr1': 1,
          'my-attr2': true,
          'my-attr3': 'value3',
        },
      })
      .end();

    tracer
      .startSpan('span-3', {
        attributes: {
          'my-attr3': 'value3',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(3);

    // Scrubbing applied
    expect(finishedSpans[0].attributes).to.deep.equal({
      'my-attr1': 'SCRUBBED!',
      'my-attr2': '*****',
      'my-attr3': 'value3',
    });

    // Non-string attributes are ignored
    expect(finishedSpans[1].attributes).to.deep.equal({
      'my-attr1': 1,
      'my-attr2': true,
      'my-attr3': 'value3',
    });

    // No relevant attributes to scrub
    expect(finishedSpans[2].attributes).to.deep.equal({
      'my-attr3': 'value3',
    });
  });
});
