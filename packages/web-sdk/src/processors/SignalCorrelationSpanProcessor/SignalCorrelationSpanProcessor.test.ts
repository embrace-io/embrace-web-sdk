import { DiagLogLevel, diag } from '@opentelemetry/api';
import { millisToHrTime } from '@opentelemetry/core';
import type { Span } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import * as sinon from 'sinon';
import { InMemoryDiagLogger } from '../../../tests/utils/index.ts';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import { KEY_EMB_SOFT_NAVIGATION_SOURCE } from '../../instrumentations/soft-navigation-performance/SoftNavigationPerformanceInstrumentation/constants.ts';
import { SignalBuffer } from '../utils/SignalBuffer.ts';
import { SignalCorrelationSpanProcessor } from './SignalCorrelationSpanProcessor.ts';

const { expect } = chai;

const fakeSpan = (opts: {
  spanId?: string;
  startEpochMillis: number;
  attributes?: Record<string, unknown>;
}): Span =>
  ({
    attributes: opts.attributes ?? {},
    startTime: millisToHrTime(opts.startEpochMillis),
    spanContext: () => ({
      spanId: opts.spanId ?? 'span-id',
      traceId: 'trace-id',
      traceFlags: 1,
    }),
  }) as unknown as Span;

describe('SignalCorrelationSpanProcessor', () => {
  let diagLogger: InMemoryDiagLogger;

  beforeEach(() => {
    diagLogger = new InMemoryDiagLogger();
    diag.setLogger(diagLogger, DiagLogLevel.ALL);
  });

  afterEach(() => {
    diag.disable();
  });

  it('records a normal span at onStart', () => {
    const buffer = new SignalBuffer();
    const processor = new SignalCorrelationSpanProcessor({ buffer });

    processor.onStart(fakeSpan({ spanId: 'span-a', startEpochMillis: 1000 }));

    expect(buffer.collectWindow(1000, 1000).spanIds).to.deep.equal(['span-a']);
  });

  it('does not record a session-part span', () => {
    const buffer = new SignalBuffer();
    const processor = new SignalCorrelationSpanProcessor({ buffer });

    processor.onStart(
      fakeSpan({
        startEpochMillis: 1000,
        attributes: { [KEY_EMB_TYPE]: EMB_TYPES.SessionPart },
      }),
    );

    expect(buffer.collectWindow(0, 10000).spanIds).to.deep.equal([]);
  });

  it('does not record a soft-navigation span', () => {
    const buffer = new SignalBuffer();
    const processor = new SignalCorrelationSpanProcessor({ buffer });

    processor.onStart(
      fakeSpan({
        startEpochMillis: 1000,
        attributes: { [KEY_EMB_SOFT_NAVIGATION_SOURCE]: 'polyfill' },
      }),
    );

    expect(buffer.collectWindow(0, 10000).spanIds).to.deep.equal([]);
  });

  it('records the emb.type already present on the span at onStart', () => {
    const buffer = new SignalBuffer();
    const processor = new SignalCorrelationSpanProcessor({ buffer });

    processor.onStart(
      fakeSpan({
        spanId: 'span-a',
        startEpochMillis: 1000,
        attributes: { [KEY_EMB_TYPE]: EMB_TYPES.Perf },
      }),
    );

    expect(buffer.collectWindow(1000, 1000).spanTypes).to.deep.equal([
      EMB_TYPES.Perf,
    ]);
  });

  it('records an empty type when the span has no emb.type yet', () => {
    const buffer = new SignalBuffer();
    const processor = new SignalCorrelationSpanProcessor({ buffer });

    // e.g. a network span, whose emb.type is only stamped later in onEnding
    processor.onStart(fakeSpan({ spanId: 'span-a', startEpochMillis: 1000 }));

    expect(buffer.collectWindow(1000, 1000).spanTypes).to.deep.equal(['']);
  });

  it('logs an error when recording the span throws', () => {
    const buffer = new SignalBuffer();
    sinon.stub(buffer, 'record').throws(new Error('boom'));
    const processor = new SignalCorrelationSpanProcessor({ buffer });

    processor.onStart(fakeSpan({ spanId: 'span-a', startEpochMillis: 1000 }));

    expect(diagLogger.getErrorLogs()).to.include(
      'failed to record span for correlation',
    );
  });

  it('should make sure forceFlush no-op does not fail', () => {
    const processor = new SignalCorrelationSpanProcessor({
      buffer: new SignalBuffer(),
    });

    expect(async () => {
      await processor.forceFlush();
    }).to.not.throw();
  });

  it('should make sure shutdown no-op does not fail', () => {
    const processor = new SignalCorrelationSpanProcessor({
      buffer: new SignalBuffer(),
    });

    expect(async () => {
      await processor.shutdown();
    }).to.not.throw();
  });
});
