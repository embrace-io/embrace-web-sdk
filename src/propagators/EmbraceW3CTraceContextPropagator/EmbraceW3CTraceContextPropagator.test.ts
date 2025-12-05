import { context, defaultTextMapSetter, trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import { StackContextManager } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { setupTestTraceExporter } from '../../testUtils/index.ts';
import { EmbraceW3CTraceContextPropagator } from './EmbraceW3CTraceContextPropagator.ts';

const { expect } = chai;

describe('EmbraceW3CTraceContextPropagator', () => {
  let memoryExporter: InMemorySpanExporter;

  before(() => {
    memoryExporter = setupTestTraceExporter();

    const contextManager = new StackContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
  });

  beforeEach(() => {
    memoryExporter.reset();
  });

  after(() => {
    context.disable();
  });

  it('should set a traceparent attribute on the span when injecting the traceparent header', () => {
    const propagator = new EmbraceW3CTraceContextPropagator();
    const headers: Record<string, string> = {};
    const span = trace.getTracer('test').startSpan('span');

    context.with(trace.setSpan(context.active(), span), () => {
      propagator.inject(context.active(), headers, defaultTextMapSetter);
    });

    const expectedTraceparent = `00-${span.spanContext().traceId}-${span.spanContext().spanId}-01`;
    expect(headers['traceparent']).to.equal(expectedTraceparent);

    span.end();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const injectedSpan = finishedSpans[0];
    expect(injectedSpan.attributes).to.deep.equal({
      'emb.w3c_traceparent': expectedTraceparent,
    });
  });
});
