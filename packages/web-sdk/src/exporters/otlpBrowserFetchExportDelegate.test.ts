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
  fakeFetchWasCalled,
} from '../../tests/utils/index.ts';
import { mockSpan } from '../../tests/utils/mock-entities/ReadableSpan.ts';
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

const createTestDelegate = (config = TEST_CONFIG) =>
  createOtlpBrowserFetchExportDelegate(
    config,
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
    const delegate = createTestDelegate();

    const result = await new Promise<ExportResult>((resolve) => {
      delegate.export([mockSpan], resolve);
    });

    expect(result.code).to.equal(ExportResultCode.SUCCESS);
    const headers = fakeFetchGetRequestHeaders() as Record<string, string>;
    expect(headers['Content-Encoding']).to.be.undefined;

    const body = fakeFetchGetBody() as Uint8Array<ArrayBuffer>;
    const parsed = JSON.parse(new TextDecoder().decode(body)) as {
      resourceSpans: unknown[];
    };
    expect(parsed.resourceSpans).to.be.an('array');
  });

  it('should charge the keepalive budget the compressed size', async () => {
    fakeFetchInstall();
    // 80KiB serialized exceeds the 48KiB keepalive budget but gzips well under
    // it, so keepalive stays on only if the budget counts compressed bytes.
    const bulkySpan: ReadableSpan = {
      ...mockSpan,
      attributes: { 'test.attribute': 'a'.repeat(80 * 1024) },
    };
    const delegate = createTestDelegate({
      ...TEST_CONFIG,
      compression: 'gzip',
    });

    const result = await new Promise<ExportResult>((resolve) => {
      delegate.export([bulkySpan], resolve);
    });

    expect(result.code).to.equal(ExportResultCode.SUCCESS);
    const body = fakeFetchGetBody() as Uint8Array<ArrayBuffer>;
    expect(body.byteLength).to.be.lessThan(49152);
    expect(fakeFetchGetKeepalive()).to.equal(true);
  });

  it('should reach fetch in the same task as export', () => {
    fakeFetchInstall();
    const delegate = createTestDelegate({
      ...TEST_CONFIG,
      compression: 'gzip',
    });

    delegate.export([mockSpan], () => undefined);

    // Checked synchronously: unload teardown may never run work deferred to a
    // later task, so the export path keeps fetch in the current one.
    expect(fakeFetchWasCalled()).to.equal(true);
  });
});
