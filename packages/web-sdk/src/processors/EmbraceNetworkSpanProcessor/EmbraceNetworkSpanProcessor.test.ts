import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import { setupTestTraceExporter } from '../../../tests/utils/index.ts';
import { EmbraceNetworkSpanProcessor } from './EmbraceNetworkSpanProcessor.ts';

const { expect } = chai;

describe('EmbraceNetworkSpanProcessor', () => {
  let memoryExporter: InMemorySpanExporter;
  let tracer: Tracer;

  before(() => {
    memoryExporter = setupTestTraceExporter([
      new EmbraceNetworkSpanProcessor({
        embraceExporterEndpoints: [
          'https://a-11111.data.emb-api.com/v2/spans',
          'https://Collector.Example.com:443/v2/logs',
          '/collector/v2/spans',
        ],
      }),
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

  it('should flag a request to an exporter endpoint as an Embrace export', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'POST',
          'http.response.status_code': 200,
          'url.full': 'https://a-11111.data.emb-api.com/v2/spans',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes['emb.type']).to.equal(
      'perf.network_request',
    );
    expect(finishedSpans[0].attributes['emb.is_embrace_export']).to.equal(true);
  });

  it('should match an exporter endpoint that differs from url.full only in host case and default port', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'POST',
          'http.response.status_code': 200,
          'url.full': 'https://collector.example.com/v2/logs',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes['emb.type']).to.equal(
      'perf.network_request',
    );
    expect(finishedSpans[0].attributes['emb.is_embrace_export']).to.equal(true);
  });

  it('should match a relative exporter endpoint against the absolute url.full', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'POST',
          'http.response.status_code': 200,
          'url.full': `${window.location.origin}/collector/v2/spans`,
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes['emb.type']).to.equal(
      'perf.network_request',
    );
    expect(finishedSpans[0].attributes['emb.is_embrace_export']).to.equal(true);
  });

  it('should keep matching valid exporter endpoints when one is unparseable', () => {
    const exporter = new InMemorySpanExporter();
    const localTracer = new TracerProvider({
      spanProcessors: [
        new EmbraceNetworkSpanProcessor({
          embraceExporterEndpoints: [
            'http://[',
            'https://a-11111.data.emb-api.com/v2/spans',
          ],
        }),
        new SimpleSpanProcessor({ exporter }),
      ],
    }).getTracer('test-tracer');

    localTracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'POST',
          'http.response.status_code': 200,
          'url.full': 'https://a-11111.data.emb-api.com/v2/spans',
        },
      })
      .end();

    const finishedSpans = exporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes['emb.type']).to.equal(
      'perf.network_request',
    );
    expect(finishedSpans[0].attributes['emb.is_embrace_export']).to.equal(true);
  });

  it('should not flag any network span when no exporter endpoints are given', () => {
    const exporter = new InMemorySpanExporter();
    const localTracer = new TracerProvider({
      spanProcessors: [
        new EmbraceNetworkSpanProcessor(),
        new SimpleSpanProcessor({ exporter }),
      ],
    }).getTracer('test-tracer');

    localTracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'POST',
          'http.response.status_code': 200,
          'url.full': 'https://a-11111.data.emb-api.com/v2/spans',
        },
      })
      .end();

    const finishedSpans = exporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes['emb.type']).to.equal(
      'perf.network_request',
    );
    expect(finishedSpans[0].attributes).to.not.have.property(
      'emb.is_embrace_export',
    );
  });

  it('should not flag a request to another path on the exporter endpoint host', () => {
    tracer
      .startSpan('network-request', {
        attributes: {
          'http.request.method': 'GET',
          'http.response.status_code': 200,
          'url.full': 'https://a-11111.data.emb-api.com/v2/config',
        },
      })
      .end();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    expect(finishedSpans[0].attributes['emb.type']).to.equal(
      'perf.network_request',
    );
    expect(finishedSpans[0].attributes).to.not.have.property(
      'emb.is_embrace_export',
    );
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
});
