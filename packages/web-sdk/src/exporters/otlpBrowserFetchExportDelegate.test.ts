import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  JsonTraceSerializer,
  TraceExporterMetricsHelper,
} from '#embrace-io/otlp-transformer'; // internal package: https://nodejs.org/api/packages.html#imports
import {
  fakeFetchGetBody,
  fakeFetchGetKeepalive,
  fakeFetchGetRequestHeaders,
  fakeFetchInstall,
  fakeFetchRespondWith,
  fakeFetchRestore,
  fakeFetchWasCalled,
} from '../../tests/utils/index.ts';
import { mockSpan } from '../../tests/utils/mock-entities/ReadableSpan.ts';
import { _resetKeepaliveTracking } from '../transport/FetchTransport/FetchTransport.ts';
import { BaseFetchExporter } from './BaseFetchExporter/index.ts';
import { createOtlpBrowserFetchExportDelegate } from './otlpBrowserFetchExportDelegate.ts';
import type { OtlpFetchExporterConfig } from './types.ts';

const { expect } = chai;

const TEST_CONFIG: OtlpFetchExporterConfig = {
  url: 'https://example.com/v2/spans',
  headers: {},
  compression: 'none',
  concurrencyLimit: 2,
  timeoutMillis: 1000,
};

const createTestDelegate = () =>
  createOtlpBrowserFetchExportDelegate(
    TEST_CONFIG,
    JsonTraceSerializer,
    'otlp_http_span_exporter',
    TraceExporterMetricsHelper,
  );

describe('createOtlpBrowserFetchExportDelegate', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should report success when the transport resolves successfully', async () => {
    sinon.stub(window, 'fetch').resolves(new Response());
    const delegate = createTestDelegate();

    const result = await new Promise<ExportResult>((resolve) => {
      delegate.export([mockSpan], resolve);
    });

    expect(result.code).to.equal(ExportResultCode.SUCCESS);
  });

  it('should report failure when the transport fails', async () => {
    sinon.stub(window, 'fetch').resolves(new Response(null, { status: 400 }));
    const delegate = createTestDelegate();

    const result = await new Promise<ExportResult>((resolve) => {
      delegate.export([mockSpan], resolve);
    });

    expect(result.code).to.equal(ExportResultCode.FAILED);
    expect(result.error?.message).to.equal('400 Fetch request failed');
  });

  it('should fail exports beyond the concurrency limit', () => {
    sinon
      .stub(window, 'fetch')
      .callsFake(() => new Promise<Response>(() => {}));
    const delegate = createTestDelegate();

    const settledResults: ExportResult[] = [];
    delegate.export([mockSpan], (result) => settledResults.push(result));
    delegate.export([mockSpan], (result) => settledResults.push(result));

    let overLimitResult: ExportResult | undefined;
    delegate.export([mockSpan], (result) => {
      overLimitResult = result;
    });

    expect(overLimitResult?.code).to.equal(ExportResultCode.FAILED);
    expect(overLimitResult?.error?.message).to.equal(
      'Concurrent export limit reached',
    );
    // the two pending exports must not have settled
    expect(settledResults).to.have.lengthOf(0);
  });

  it('should free up the queue once pending exports settle', async () => {
    sinon.stub(window, 'fetch').resolves(new Response());
    const delegate = createTestDelegate();

    for (let i = 0; i < TEST_CONFIG.concurrencyLimit; i++) {
      await new Promise<ExportResult>((resolve) => {
        delegate.export([mockSpan], resolve);
      });
    }

    const result = await new Promise<ExportResult>((resolve) => {
      delegate.export([mockSpan], resolve);
    });

    expect(result.code).to.equal(ExportResultCode.SUCCESS);
  });

  it('should resolve forceFlush once pending exports settle', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    sinon.stub(window, 'fetch').callsFake(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const delegate = createTestDelegate();

    let exportSettled = false;
    delegate.export([mockSpan], () => {
      exportSettled = true;
    });

    const flushPromise = delegate.forceFlush().then(() => {
      expect(exportSettled).to.equal(true);
    });
    resolveFetch(new Response());
    await flushPromise;
  });

  it('should not compress or set Content-Encoding when compression is none', async () => {
    fakeFetchInstall();
    fakeFetchRespondWith('');

    try {
      const exporter = new BaseFetchExporter(createTestDelegate());
      await new Promise<void>((resolve) => {
        exporter.export([mockSpan], (result) => {
          expect(result.code).to.equal(ExportResultCode.SUCCESS);
          resolve();
        });
      });

      const headers = fakeFetchGetRequestHeaders() as Record<string, string>;
      expect(headers['Content-Encoding']).to.be.undefined;

      const body = fakeFetchGetBody() as Uint8Array<ArrayBuffer>;
      const parsed = JSON.parse(new TextDecoder().decode(body)) as {
        resourceSpans: unknown[];
      };
      expect(parsed.resourceSpans).to.be.an('array');
    } finally {
      fakeFetchRestore();
    }
  });
  it('should charge the keepalive budget the compressed size', async () => {
    fakeFetchInstall();
    fakeFetchRespondWith('');
    _resetKeepaliveTracking();

    try {
      // Serializes far past the 48KiB keepalive budget but gzips to a fraction
      // of it, so keepalive survives only if the budget sees compressed bytes.
      const bulkySpan: ReadableSpan = {
        ...mockSpan,
        attributes: { 'test.attribute': 'a'.repeat(80 * 1024) },
      };

      const exporter = new BaseFetchExporter(
        createOtlpBrowserFetchExportDelegate(
          { ...TEST_CONFIG, compression: 'gzip' },
          JsonTraceSerializer,
          'otlp_http_span_exporter',
          TraceExporterMetricsHelper,
        ),
      );
      await new Promise<void>((resolve) => {
        exporter.export([bulkySpan], (result) => {
          expect(result.code).to.equal(ExportResultCode.SUCCESS);
          resolve();
        });
      });

      const body = fakeFetchGetBody() as Uint8Array<ArrayBuffer>;
      expect(body.byteLength).to.be.lessThan(49152);
      expect(fakeFetchGetKeepalive()).to.equal(true);
    } finally {
      fakeFetchRestore();
    }
  });
  it('should reach fetch in the same task as export', () => {
    fakeFetchInstall();
    fakeFetchRespondWith('');

    try {
      const exporter = new BaseFetchExporter(
        createOtlpBrowserFetchExportDelegate(
          { ...TEST_CONFIG, compression: 'gzip' },
          JsonTraceSerializer,
          'otlp_http_span_exporter',
          TraceExporterMetricsHelper,
        ),
      );

      exporter.export([mockSpan], () => undefined);

      // Deliberately not awaited: teardown grants only a synchronous budget, so
      // an await anywhere before fetch loses the payload on the unload path.
      expect(fakeFetchWasCalled()).to.equal(true);
    } finally {
      fakeFetchRestore();
    }
  });
});
