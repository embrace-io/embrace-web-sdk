import * as chai from 'chai';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import { setupTestTraceExporter } from '../../testUtils/index.js';
import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { EmbraceNetworkSpanProcessor } from './EmbraceNetworkSpanProcessor.js';

const { expect } = chai;

describe('EmbraceNetworkSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let tracer: Tracer;

  before(() => {
    memoryExporter = setupTestTraceExporter([
      new EmbraceNetworkSpanProcessor(),
    ]);
    tracer = trace.getTracer('test-tracer');
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  it('should add emb.type when the span represents a network request', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'GET',
          'http.response.status_code': 200,
          'http.response.body.size': 10,
          'http.request.body.size': 20,
          'url.full': 'https://example.com',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const networkRequest = finishedSpans[0];
    expect(networkRequest.attributes).to.be.deep.equal({
      'emb.type': 'perf.network_request',
      'http.request.method': 'GET',
      'http.response.status_code': 200,
      'http.response.body.size': 10,
      'http.request.body.size': 20,
      'url.full': 'https://example.com',
    });
  });

  it('should copy over deprecated network attributes', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.method': 'GET',
          'http.status_code': 200,
          'http.response_content_length': 10,
          'http.request_content_length': 20,
          'http.url': 'https://example.com',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const networkRequest = finishedSpans[0];
    expect(networkRequest.attributes).to.be.deep.equal({
      'emb.type': 'perf.network_request',
      'http.request.method': 'GET',
      'http.response.status_code': 200,
      'http.response.body.size': 10,
      'http.request.body.size': 20,
      'url.full': 'https://example.com',
      'http.method': 'GET',
      'http.status_code': 200,
      'http.response_content_length': 10,
      'http.request_content_length': 20,
      'http.url': 'https://example.com',
    });
  });

  it('should do nothing for a non-network span', () => {
    tracer
      .startSpan('some-span', {
        attributes: {
          foo: 'bar',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const networkRequest = finishedSpans[0];
    expect(networkRequest.attributes).to.be.deep.equal({
      foo: 'bar',
    });
  });

  it('should do nothing if the network span does not have a valid url', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'GET',
          'http.response.status_code': 200,
          'http.response.body.size': 10,
          'http.request.body.size': 20,
          'url.full': '/some/path',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const networkRequest = finishedSpans[0];
    expect(networkRequest.attributes).to.be.deep.equal({
      'http.request.method': 'GET',
      'http.response.status_code': 200,
      'http.response.body.size': 10,
      'http.request.body.size': 20,
      'url.full': '/some/path',
    });
  });
});
