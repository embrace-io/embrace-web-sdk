import { millisToHrTime } from '@opentelemetry/core';
import type { Span } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import { KEY_EMB_SOFT_NAVIGATION_SOURCE } from '../../instrumentations/soft-navigation-performance/SoftNavigationPerformanceInstrumentation/constants.ts';
import { SoftNavigationCorrelationSpanProcessor } from './SoftNavigationCorrelationSpanProcessor.ts';
import { SoftNavigationSignalBuffer } from './SoftNavigationSignalBuffer.ts';

const { expect } = chai;

const fakeSpan = (opts: {
  spanId?: string;
  startEpochMillis: number;
  endEpochMillis?: number;
  attributes?: Record<string, unknown>;
}): Span =>
  ({
    attributes: opts.attributes ?? {},
    startTime: millisToHrTime(opts.startEpochMillis),
    endTime: millisToHrTime(opts.endEpochMillis ?? opts.startEpochMillis),
    spanContext: () => ({
      spanId: opts.spanId ?? 'span-id',
      traceId: 'trace-id',
      traceFlags: 1,
    }),
  }) as unknown as Span;

describe('SoftNavigationCorrelationSpanProcessor', () => {
  it('records a normal span at onStart', () => {
    const buffer = new SoftNavigationSignalBuffer();
    const processor = new SoftNavigationCorrelationSpanProcessor({ buffer });

    processor.onStart(fakeSpan({ spanId: 'span-a', startEpochMillis: 1000 }));

    expect(buffer.collectWindow(1000, 1000).spanIds).to.deep.equal(['span-a']);
  });

  it('does not record a session-part span', () => {
    const buffer = new SoftNavigationSignalBuffer();
    const processor = new SoftNavigationCorrelationSpanProcessor({ buffer });

    processor.onStart(
      fakeSpan({
        startEpochMillis: 1000,
        attributes: { [KEY_EMB_TYPE]: EMB_TYPES.SessionPart },
      }),
    );

    expect(buffer.collectWindow(0, 10000).spanIds).to.deep.equal([]);
  });

  it('does not record a soft-navigation span', () => {
    const buffer = new SoftNavigationSignalBuffer();
    const processor = new SoftNavigationCorrelationSpanProcessor({ buffer });

    processor.onStart(
      fakeSpan({
        startEpochMillis: 1000,
        attributes: { [KEY_EMB_SOFT_NAVIGATION_SOURCE]: 'polyfill' },
      }),
    );

    expect(buffer.collectWindow(0, 10000).spanIds).to.deep.equal([]);
  });

  it('stamps span_ids and log_ids on a soft-navigation span for its window', () => {
    const buffer = new SoftNavigationSignalBuffer();
    buffer.record({ kind: 'span', id: 'child-span', startEpochMillis: 1500 });
    buffer.record({ kind: 'log', id: 'child-log', startEpochMillis: 1600 });
    const processor = new SoftNavigationCorrelationSpanProcessor({ buffer });

    const softNav = fakeSpan({
      startEpochMillis: 1000,
      endEpochMillis: 2000,
      attributes: { [KEY_EMB_SOFT_NAVIGATION_SOURCE]: 'polyfill' },
    });
    processor.onEnding(softNav);

    expect(softNav.attributes['emb.soft_navigation.span_ids']).to.deep.equal([
      'child-span',
    ]);
    expect(softNav.attributes['emb.soft_navigation.log_ids']).to.deep.equal([
      'child-log',
    ]);
  });

  it('stamps empty arrays when the window is empty', () => {
    const buffer = new SoftNavigationSignalBuffer();
    const processor = new SoftNavigationCorrelationSpanProcessor({ buffer });

    const softNav = fakeSpan({
      startEpochMillis: 1000,
      endEpochMillis: 2000,
      attributes: { [KEY_EMB_SOFT_NAVIGATION_SOURCE]: 'polyfill' },
    });
    processor.onEnding(softNav);

    expect(softNav.attributes['emb.soft_navigation.span_ids']).to.deep.equal(
      [],
    );
    expect(softNav.attributes['emb.soft_navigation.log_ids']).to.deep.equal([]);
  });

  it('does not stamp a non-soft-navigation span at onEnding', () => {
    const buffer = new SoftNavigationSignalBuffer();
    const processor = new SoftNavigationCorrelationSpanProcessor({ buffer });

    const span = fakeSpan({ startEpochMillis: 1000, endEpochMillis: 2000 });
    processor.onEnding(span);

    void expect(span.attributes['emb.soft_navigation.span_ids']).to.be
      .undefined;
  });
});
