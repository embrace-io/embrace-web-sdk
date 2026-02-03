import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { setupTestTraceExporter } from '../../../tests/utils/index.ts';
import { EmbraceNetworkSpanProcessor } from './EmbraceNetworkSpanProcessor.ts';

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

  it('should add emb.type for network requests with a 0 response code', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'GET',
          'http.response.status_code': 0,
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
      'http.response.status_code': 0,
      'http.response.body.size': 10,
      'http.request.body.size': 20,
      'url.full': 'https://example.com',
    });
  });

  it('should handle span with only deprecated attributes', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.method': 'POST',
          'http.status_code': 201,
          'http.url': 'https://api.example.com/resource',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const networkRequest = finishedSpans[0];
    // Verify core attributes are copied over from deprecated ones
    expect(networkRequest.attributes['emb.type']).to.equal(
      'perf.network_request',
    );
    expect(networkRequest.attributes['http.request.method']).to.equal('POST');
    expect(networkRequest.attributes['http.response.status_code']).to.equal(
      201,
    );
    expect(networkRequest.attributes['url.full']).to.equal(
      'https://api.example.com/resource',
    );
    // Original deprecated attributes should still be present
    expect(networkRequest.attributes['http.method']).to.equal('POST');
    expect(networkRequest.attributes['http.status_code']).to.equal(201);
    expect(networkRequest.attributes['http.url']).to.equal(
      'https://api.example.com/resource',
    );
  });

  it('should handle span with mixed attributes (current takes precedence)', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          // Current attributes
          'http.request.method': 'PUT',
          'http.response.status_code': 200,
          'url.full': 'https://api.example.com/update',
          // Deprecated attributes (should not override current)
          'http.method': 'GET',
          'http.status_code': 404,
          'http.url': 'https://old.example.com',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const networkRequest = finishedSpans[0];
    // Current attributes should remain unchanged
    expect(networkRequest.attributes['http.request.method']).to.equal('PUT');
    expect(networkRequest.attributes['http.response.status_code']).to.equal(
      200,
    );
    expect(networkRequest.attributes['url.full']).to.equal(
      'https://api.example.com/update',
    );
    expect(networkRequest.attributes['emb.type']).to.equal(
      'perf.network_request',
    );
  });

  it('should handle URL with query parameters', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'GET',
          'http.response.status_code': 200,
          'url.full': 'https://example.com/api?param=value&foo=bar',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes['emb.type']).to.equal(
      'perf.network_request',
    );
  });

  it('should handle URL with port number', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'GET',
          'http.response.status_code': 200,
          'url.full': 'https://example.com:8080/api',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes['emb.type']).to.equal(
      'perf.network_request',
    );
  });

  it('should not process span with empty URL', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'GET',
          'http.response.status_code': 200,
          'url.full': '',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes['emb.type']).to.be.undefined;
  });

  it('should not process span with missing URL attribute', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'GET',
          'http.response.status_code': 200,
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes['emb.type']).to.be.undefined;
  });
});
