import type { DiagLogger } from '@opentelemetry/api';
import {
  context,
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  propagation,
  trace,
} from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { CompositePropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import type { SinonStub } from 'sinon';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { MetricWithAttribution } from 'web-vitals/attribution';
import {
  FakeInstrumentation,
  FakeLogRecordProcessor,
  FakeSpanProcessor,
  fakeFetchGetConfigUrl,
  fakeFetchGetSpansBody,
  fakeFetchGetSpansRequestHeaders,
  fakeFetchInstall,
  fakeFetchResetHistory,
  fakeFetchRespondWith,
  fakeFetchRestore,
  fakeFetchWasCalled,
  InMemoryDiagLogger,
  setupTestWebVitalListeners,
} from '../../tests/utils/index.ts';
import { log, NoOpLogManager, ProxyLogManager } from '../api-logs/index.ts';
import { page } from '../api-page/index.ts';
import {
  NoOpUserSessionManager,
  ProxyUserSessionManager,
  session,
} from '../api-sessions/index.ts';
import {
  trace as embtrace,
  NoOpTraceManager,
  ProxyTraceManager,
} from '../api-traces/index.ts';
import { NoOpUserManager, ProxyUserManager, user } from '../api-users/index.ts';
import type { WebVitalOnReport } from '../instrumentations/index.ts';
import { RageClickInstrumentation } from '../instrumentations/index.ts';
import type { UserSessionManagerInternal } from '../managers/EmbraceUserSessionManager/index.ts';
import {
  EmbraceLogManager,
  EmbraceTraceManager,
  EmbraceUserManager,
  EmbraceUserSessionManager,
} from '../managers/index.ts';
import { SDK_VERSION } from '../resources/index.ts';
import { OTelPerformanceManager } from '../utils/index.ts';
import { initSDK } from './initSDK.ts';
import { registry } from './registry.ts';
import type {
  DynamicConfigManager,
  SDKControl,
  SDKInitConfig,
} from './types.ts';

chai.use(sinonChai);
const { expect } = chai;

// OTel's level filter binds the logger's methods eagerly inside setLogger, so
// the stubs have to be swapped in on the way through rather than afterwards.
const stubDiagLoggerMethods = (
  stubs: Partial<Record<keyof DiagLogger, SinonStub>>,
) => {
  const setLogger = diag.setLogger.bind(diag);
  return sinon.stub(diag, 'setLogger').callsFake((logger, options) => {
    // stubbing whatever arrives would silently pass if initSDK stopped routing
    // its diagnostics through the console logger
    expect(logger).to.be.instanceOf(DiagConsoleLogger);
    Object.assign(logger, stubs);
    return setLogger(logger, options);
  });
};

type ExportedSpan = ReadableSpan & {
  spanId: string;
  traceId: string;
  attributes: {
    key: string;
    value: {
      stringValue: string;
    } & {
      intValue: number;
    } & {
      doubleValue: number;
    } & {
      boolValue: boolean;
    } & {
      arrayValue: {
        values: { stringValue: string }[];
      };
    };
  }[];
};

type SpanScope = {
  name: string;
  version?: string;
};

const otlpAttrsToRecord = (
  attrs: ExportedSpan['attributes'],
): Record<string, string | number | boolean> => {
  const out: Record<string, string | number | boolean> = {};
  for (const a of attrs) {
    const v = a.value;
    if (typeof v.boolValue === 'boolean') {
      out[a.key] = v.boolValue;
    } else if (typeof v.intValue === 'number') {
      out[a.key] = v.intValue;
    } else if (typeof v.doubleValue === 'number') {
      out[a.key] = v.doubleValue;
    } else {
      out[a.key] = v.stringValue;
    }
  }
  return out;
};

const getLastSessionExportedSpans = async (
  spansExportNumber = 0,
  scope: SpanScope = { name: 'embrace-web-sdk-traces' },
) => {
  // Needed to allow the transport to actually send its data off to fetch
  await new Promise((r) => setTimeout(r, 1));

  // Address the export by its position among spans sends, skipping interleaved
  // remote-config fetches and logs sends.
  const body = fakeFetchGetSpansBody(spansExportNumber);
  void expect(body).not.to.be.null;
  const decompressedStream = new Response(body).body?.pipeThrough(
    new DecompressionStream('gzip'),
  );
  // translate from Uint8Array to string
  const text = await new Response(decompressedStream).text();
  const parsed = JSON.parse(text) as never;

  expect(parsed['resourceSpans']).to.have.lengthOf(1);
  const resourceSpan = parsed['resourceSpans'][0];
  void expect(resourceSpan['scopeSpans']).not.to.be.undefined;

  // NavigationInstrumentation always registers its own scope alongside
  // whichever scope this call is after, so scopeSpans aren't matched by
  // position — look each one up by scope name/version instead.
  const scopeSpans = resourceSpan['scopeSpans'] as Array<{
    scope: SpanScope;
    spans: ExportedSpan[];
  }>;
  const matchesScope = (actual: SpanScope, expected: SpanScope): boolean =>
    actual.name === expected.name && actual.version === expected.version;

  const sessionScopeSpan = scopeSpans.find((s) =>
    matchesScope(s.scope, { name: 'embrace-web-sdk-session-parts' }),
  );
  void expect(sessionScopeSpan).not.to.be.undefined;
  expect(sessionScopeSpan?.spans).to.have.lengthOf(1);
  expect(sessionScopeSpan?.spans[0]['name']).to.be.equal('emb-session-part');

  const otherScopeSpan = scopeSpans.find((s) => matchesScope(s.scope, scope));
  void expect(otherScopeSpan).not.to.be.undefined;

  return otherScopeSpan?.spans ?? [];
};

describe('initSDK', () => {
  let spanExporter: InMemorySpanExporter;
  let logExporter: InMemoryLogRecordExporter;
  let fetchStub: SinonStub;

  before(() => {
    spanExporter = new InMemorySpanExporter();
    logExporter = new InMemoryLogRecordExporter();
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fetchStub = fakeFetchInstall();
  });

  afterEach(() => {
    spanExporter.reset();
    logExporter.reset();
    trace.disable();
    logs.disable();
    diag.disable();
    context.disable();
    registry.clear();
    fakeFetchRestore();
  });

  it('should require an appID when not setting custom exporters', () => {
    const diagLogger = new InMemoryDiagLogger();
    // @ts-expect-error need to bypass type checking to test this invalid configuration
    const result = initSDK({ diagLogger });
    void expect(result).to.be.false;

    expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
    expect(diagLogger.getErrorLogs()[0]).to.equal(
      'failed to initialize the SDK: when appID is omitted, at least one logExporter or spanExporter must be set',
    );
  });

  describe('appVersion validation', () => {
    it('should reject empty string', () => {
      const diagLogger = new InMemoryDiagLogger();
      const result = initSDK({
        appID: 'abc12',
        appVersion: '',
        diagLogger,
      });
      void expect(result).to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.equal(
        'failed to initialize the SDK: if appVersion is specified, it cannot be an empty string.',
      );
    });

    it('should reject whitespace-only', () => {
      const diagLogger = new InMemoryDiagLogger();
      const result = initSDK({
        appID: 'abc12',
        appVersion: '   ',
        diagLogger,
      });
      void expect(result).to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.equal(
        'failed to initialize the SDK: if appVersion is specified, it cannot be an empty string.',
      );
    });

    it('should reject number', () => {
      const diagLogger = new InMemoryDiagLogger();
      const result = initSDK({
        appID: 'abc12',
        // @ts-expect-error testing runtime behavior with invalid type
        appVersion: 123,
        diagLogger,
      });
      void expect(result).to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.equal(
        'failed to initialize the SDK: if appVersion is specified, it must be a string. Received 123',
      );
    });

    it('should reject null', () => {
      const diagLogger = new InMemoryDiagLogger();
      const result = initSDK({
        appID: 'abc12',
        // @ts-expect-error testing runtime behavior with invalid type
        appVersion: null,
        diagLogger,
      });
      void expect(result).to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.equal(
        'failed to initialize the SDK: if appVersion is specified, it must be a string. Received null',
      );
    });

    it('should accept undefined', () => {
      const diagLogger = new InMemoryDiagLogger();
      const result = initSDK({
        appID: 'abc12',
        diagLogger,
      });
      void expect(result).not.to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(0);
    });
  });

  describe('appID validation', () => {
    it('should ensure specified string is 5 characters long', () => {
      const diagLogger = new InMemoryDiagLogger();
      const result = initSDK({ appID: 'long-app-id', diagLogger });
      void expect(result).to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.equal(
        'failed to initialize the SDK: appID should be 5 characters long, or omitted if not using Embrace. Received "long-app-id"',
      );
    });

    it('should reject number', () => {
      const diagLogger = new InMemoryDiagLogger();
      const result = initSDK({
        // @ts-expect-error testing runtime behavior with invalid type
        appID: 12345,
        diagLogger,
      });
      void expect(result).to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.equal(
        'failed to initialize the SDK: appID must be a string, or omitted if not using Embrace. Received 12345',
      );
    });

    it('should reject null', () => {
      const diagLogger = new InMemoryDiagLogger();
      const result = initSDK({
        // @ts-expect-error testing runtime behavior with invalid type
        appID: null,
        diagLogger,
      });
      void expect(result).to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.equal(
        'failed to initialize the SDK: appID must be a string, or omitted if not using Embrace. Received null',
      );
    });

    it('should reject undefined without exporters', () => {
      const diagLogger = new InMemoryDiagLogger();
      // @ts-expect-error intentionally missing appID
      const result = initSDK({
        diagLogger,
      });
      void expect(result).to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.equal(
        'failed to initialize the SDK: when appID is omitted, at least one logExporter or spanExporter must be set',
      );
    });

    it('should accept undefined with exporters', () => {
      const diagLogger = new InMemoryDiagLogger();
      const result = initSDK({
        logExporters: [logExporter],
        spanExporters: [spanExporter],
        diagLogger,
      });
      void expect(result).not.to.be.false;
      expect(diagLogger.getErrorLogs()).to.have.lengthOf(0);
    });

    it('should reject empty string', () => {
      const diagLogger = new InMemoryDiagLogger();
      const result = initSDK({
        appID: '',
        logExporters: [logExporter],
        diagLogger,
      });
      void expect(result).to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.equal(
        'failed to initialize the SDK: appID should be 5 characters long, or omitted if not using Embrace. Received ""',
      );
    });
  });

  it('should allow setting custom instrumentations', async () => {
    const instrumentation = new FakeInstrumentation();
    const result = initSDK({
      logExporters: [logExporter],
      spanExporters: [spanExporter],
      instrumentations: [instrumentation],
      defaultInstrumentationConfig: { omit: new Set(['web-vital']) },
    });
    void expect(result).not.to.be.false;

    instrumentation.emit();
    if (result) {
      await result.flush();
    }

    const finishedSpans = spanExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    void expect(finishedSpans[0].name).to.be.equal('my span');

    const finishedLogRecords = logExporter.getFinishedLogRecords();
    expect(finishedLogRecords).to.have.lengthOf(1);
    void expect(finishedLogRecords[0].body).to.be.equal('my log');
  });

  it('should allow setting custom processors', async () => {
    const instrumentation = new FakeInstrumentation();

    const result = initSDK({
      logExporters: [logExporter],
      spanExporters: [spanExporter],
      logProcessors: [new FakeLogRecordProcessor()],
      spanProcessors: [new FakeSpanProcessor()],
      instrumentations: [instrumentation],
      defaultInstrumentationConfig: { omit: new Set(['web-vital']) },
    });
    void expect(result).not.to.be.false;

    instrumentation.emit();
    if (result) {
      await result.flush();
    }

    const finishedSpans = spanExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    void expect(finishedSpans[0].name).to.be.equal('my span');
    void expect(finishedSpans[0].attributes['fake']).to.be.equal('my-attr');

    const finishedLogRecords = logExporter.getFinishedLogRecords();
    expect(finishedLogRecords).to.have.lengthOf(1);
    void expect(finishedLogRecords[0].body).to.be.equal('my log');
    void expect(finishedLogRecords[0].attributes['fake']).to.be.equal(
      'my-attr',
    );
  });

  it('should allow controlling default instrumentations', async () => {
    const testWebVitalListeners = setupTestWebVitalListeners();
    const result = initSDK({
      logExporters: [logExporter],
      spanExporters: [spanExporter],
      logProcessors: [new FakeLogRecordProcessor()],
      spanProcessors: [new FakeSpanProcessor()],
      defaultInstrumentationConfig: {
        'web-vital': { listeners: testWebVitalListeners.listeners },
      },
    });
    void expect(result).not.to.be.false;
    // Called twice: first for urlAttribution (reportAllChanges), second for emission
    void expect(testWebVitalListeners.clsStub.calledTwice).to.be.true;
    const pageTrackFunc = testWebVitalListeners.clsStub.getCall(0)
      .args[0] as WebVitalOnReport;
    const emitFunc = testWebVitalListeners.clsStub.getCall(1)
      .args[0] as WebVitalOnReport;

    const clsMetric = {
      name: 'CLS',
      value: 22,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      navigationId: 1,
      attribution: {},
    } as MetricWithAttribution;

    pageTrackFunc(clsMetric);
    emitFunc(clsMetric);

    if (result) {
      await result.flush();
    }

    const finishedLogRecords = logExporter.getFinishedLogRecords();
    const clsRecord = finishedLogRecords.find(
      (r) => r.attributes['browser.web_vital.name'] === 'cls',
    );
    void expect(clsRecord).not.to.be.undefined;
    void expect(clsRecord?.eventName).to.equal('browser.web_vital');
  });

  it('should allow omitting optional instrumentations', () => {
    const testWebVitalListeners = setupTestWebVitalListeners();
    const result = initSDK({
      logExporters: [logExporter],
      spanExporters: [spanExporter],
      logProcessors: [new FakeLogRecordProcessor()],
      spanProcessors: [new FakeSpanProcessor()],
      defaultInstrumentationConfig: {
        omit: new Set(['web-vital']),
        'web-vital': { listeners: testWebVitalListeners.listeners },
      },
    });
    void expect(result).not.to.be.false;
    void expect(testWebVitalListeners.clsStub.called).to.be.false;
  });

  it('should register the rage-click instrumentation by default', () => {
    const enableSpy = sinon.spy(RageClickInstrumentation.prototype, 'enable');

    try {
      const result = initSDK({
        logExporters: [logExporter],
        spanExporters: [spanExporter],
        logProcessors: [new FakeLogRecordProcessor()],
        spanProcessors: [new FakeSpanProcessor()],
      });
      void expect(result).not.to.be.false;
      void expect(enableSpy.calledOnce).to.be.true;
    } finally {
      enableSpy.restore();
    }
  });

  it('should allow omitting the rage-click instrumentation', () => {
    const enableSpy = sinon.spy(RageClickInstrumentation.prototype, 'enable');

    try {
      const result = initSDK({
        logExporters: [logExporter],
        spanExporters: [spanExporter],
        logProcessors: [new FakeLogRecordProcessor()],
        spanProcessors: [new FakeSpanProcessor()],
        defaultInstrumentationConfig: {
          omit: new Set(['rage-click']),
        },
      });
      void expect(result).not.to.be.false;
      void expect(enableSpy.called).to.be.false;
    } finally {
      enableSpy.restore();
    }
  });

  it('should register all global managers', async () => {
    const result = initSDK({
      appID: 'abc12',
      logExporters: [logExporter],
      spanExporters: [spanExporter],
      defaultInstrumentationConfig: { omit: new Set(['web-vital']) },
    });
    void expect(result).not.to.be.false;

    expect(log.getLogManager()).to.be.instanceOf(ProxyLogManager);
    expect(
      (log.getLogManager() as ProxyLogManager).getDelegate(),
    ).to.be.instanceOf(EmbraceLogManager);

    expect(session.getUserSessionManager()).to.be.instanceOf(
      ProxyUserSessionManager,
    );
    expect(
      (
        session.getUserSessionManager() as ProxyUserSessionManager
      ).getDelegate(),
    ).to.be.instanceOf(EmbraceUserSessionManager);
    // Calling a public method on `session` must reach the same delegate, which
    // proves the proxy chain is wired up between the API and the registered
    // manager.
    expect(session.getUserSessionId()).to.equal(
      session.getUserSessionManager().getUserSessionId(),
    );

    expect(embtrace.getTraceManager()).to.be.instanceOf(ProxyTraceManager);
    expect(
      (embtrace.getTraceManager() as ProxyTraceManager).getDelegate(),
    ).to.be.instanceOf(EmbraceTraceManager);

    expect(user.getUserManager()).to.be.instanceOf(ProxyUserManager);
    expect(
      (user.getUserManager() as ProxyUserManager).getDelegate(),
    ).to.be.instanceOf(EmbraceUserManager);

    embtrace.startSpan('my performance span').end();
    // shouldn't get exported
    embtrace.startSpan('my unfinished performance span');

    log.message('my custom log', 'info');

    if (result) {
      await result.flush();
    }

    const finishedSpans = spanExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    void expect(finishedSpans[0].name).to.be.equal('my performance span');

    const finishedLogRecords = logExporter.getFinishedLogRecords();
    expect(finishedLogRecords).to.have.lengthOf(1);
    void expect(finishedLogRecords[0].body).to.be.equal('my custom log');
  });

  it('should allow setting dynamic config through the SDK', () => {
    const refreshRemoteConfigStub = sinon.stub();
    const setConfigStub = sinon.stub();
    const myCustomConfigManager: DynamicConfigManager = {
      refreshRemoteConfig: refreshRemoteConfigStub,
      setConfig: setConfigStub,
      getConfig: () => ({
        samplingPct: 100,
      }),
    };

    const diagLogger = new InMemoryDiagLogger();
    const result = initSDK({
      appID: 'abc12',
      diagLogger,
      dynamicSDKConfigManager: myCustomConfigManager,
    });
    void expect(result).not.to.be.false;

    if (result) {
      result.setDynamicConfig({ samplingPct: 50 });

      void expect(refreshRemoteConfigStub.calledOnce).to.be.true;
      void expect(
        setConfigStub.calledOnceWith({
          samplingPct: 50,
        }),
      ).to.be.true;
    }
  });

  it('should setup a default context manager when none is provided', async () => {
    const result = initSDK({
      spanExporters: [spanExporter],
    });
    void expect(result).not.to.be.false;

    trace.getTracer('test').startActiveSpan('my active span', (active) => {
      trace.getTracer('test').startSpan('my child span').end();
      trace
        .getSpan(context.active())
        ?.setAttribute('active-span-attribute', 'foo');
      active.end();
    });

    if (result) {
      await result.flush();
    }

    const finishedSpans = spanExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(2);
    const active = finishedSpans[1];
    const child = finishedSpans[0];

    expect(active.name).to.be.equal('my active span');
    expect(active.attributes['active-span-attribute']).to.be.equal('foo');
    expect(child.name).to.be.equal('my child span');
    expect(child.parentSpanContext?.traceId).to.be.equal(
      active.spanContext().traceId,
    );
    expect(child.parentSpanContext?.spanId).to.be.equal(
      active.spanContext().spanId,
    );
  });

  it('should not initialize on restricted protocols', () => {
    const diagLogger = new InMemoryDiagLogger();
    const result = initSDK({
      appID: 'app12',
      diagLogger,
      // we can't easily override window.location.protocol for this test, instead
      // leverage the fact we know it will run under http:
      restrictedProtocols: new Set(['http:']),
    });
    void expect(result).to.be.false;

    expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
    expect(diagLogger.getErrorLogs()[0]).to.equal(
      'failed to initialize the SDK: not initializing due to restricted protocol: http:',
    );
  });

  it('should not initialize on file protocol by default', () => {
    const spy = sinon.spy(Set.prototype, 'has').withArgs('http:');
    const diagLogger = new InMemoryDiagLogger();
    const result = initSDK({ appID: 'app12', diagLogger });

    // ideally we would fake the protocol to be 'file:' but since we can't easily override window.location.protocol then
    // just verify that the protocol was checked against the right default set
    expect(spy.getCall(0).thisValue).to.deep.equal(new Set(['file:']));
    void expect(result).not.to.be.false;
    expect(diagLogger.getErrorLogs()).to.have.lengthOf(0);
  });

  it('should not initialize when CompressionStream is unavailable and sending to Embrace', () => {
    const diagLogger = new InMemoryDiagLogger();
    const originalCompressionStream = (globalThis as never)[
      'CompressionStream'
    ];
    delete (globalThis as never)['CompressionStream'];

    try {
      const result = initSDK({ appID: 'app12', diagLogger });
      void expect(result).to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getErrorLogs()[0]).to.equal(
        'failed to initialize the SDK: CompressionStream is not supported in this browser and required for data compression.',
      );
    } finally {
      // Restore CompressionStream
      (globalThis as never)['CompressionStream'] = originalCompressionStream;
    }
  });

  it('should initialize when CompressionStream is unavailable but using custom exporters', () => {
    const diagLogger = new InMemoryDiagLogger();
    const originalCompressionStream = (globalThis as never)[
      'CompressionStream'
    ];
    delete (globalThis as never)['CompressionStream'];

    try {
      const result = initSDK({
        logExporters: [logExporter],
        spanExporters: [spanExporter],
        diagLogger,
      });
      void expect(result).not.to.be.false;

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(0);
    } finally {
      // Restore CompressionStream
      (globalThis as never)['CompressionStream'] = originalCompressionStream;
    }
  });

  describe('communication with Embrace', () => {
    it('should include the correct resource attributes', async () => {
      fakeFetchRespondWith('');

      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        resource: resourceFromAttributes({ r1: 'my-resource-attr' }),
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            'document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise((r) => setTimeout(r, 1));

      const sessionPartId = session.getUserSessionManager().getSessionPartId();
      // EmbracePageManager sets the initial route from the current location
      // on construction (currententrychange never fires for the page's own
      // initial entry), so PageSpanProcessor stamps every span — including
      // the session-part span — with page attributes by default.
      const appSurfaceId = page.getCurrentPageId();
      session.endUserSession();

      // Needed to allow the transport to actually send its data off to fetch
      await new Promise((r) => setTimeout(r, 1));

      const headers = fakeFetchGetSpansRequestHeaders();
      expect((headers as Record<string, string>)['X-EM-AID']).to.equal('abc12');

      const body = fakeFetchGetSpansBody();

      void expect(body).not.to.be.null;
      const decompressedStream = new Response(body).body?.pipeThrough(
        new DecompressionStream('gzip'),
      );
      // translate from Uint8Array to string
      const text = await new Response(decompressedStream).text();
      const parsed = JSON.parse(text) as never;

      expect(parsed['resourceSpans']).to.have.lengthOf(1);
      const resourceSpan = parsed['resourceSpans'][0];
      const resource = resourceSpan['resource'];

      // Different test environments will include different values for the various browser.* attributes, test on a
      // subset here rather than the full object
      expect(resource).to.containSubset({
        attributes: [
          { key: 'service.name', value: { stringValue: 'embrace-web-sdk' } },
          { key: 'telemetry.sdk.language', value: { stringValue: 'webjs' } },
          {
            key: 'telemetry.sdk.name',
            value: { stringValue: 'embrace-web-sdk' },
          },
          { key: 'telemetry.sdk.version', value: { stringValue: SDK_VERSION } },
          { key: 'r1', value: { stringValue: 'my-resource-attr' } },
          { key: 'app_version', value: { stringValue: 'my-app-version' } },
          { key: 'app_framework', value: { intValue: 1 } },
          { key: 'sdk_version', value: { stringValue: SDK_VERSION } },
          { key: 'sdk_simple_version', value: { intValue: 1 } },
          { key: 'sdk_platform', value: { stringValue: 'web' } },
          {
            key: 'user_agent.original',
            value: { stringValue: window.navigator.userAgent },
          },
        ],
        droppedAttributesCount: 0,
      });

      void expect(resourceSpan['scopeSpans']).not.to.be.undefined;
      // NavigationInstrumentation always registers its own scope alongside
      // the session-parts one, so look the latter up by name.
      expect(resourceSpan['scopeSpans']).to.have.lengthOf(2);
      const scopeSpan = (
        resourceSpan['scopeSpans'] as Array<{
          scope: { name: string };
          spans: ExportedSpan[];
        }>
      ).find((s) => s.scope.name === 'embrace-web-sdk-session-parts');
      void expect(scopeSpan).not.to.be.undefined;
      expect(scopeSpan?.spans).to.have.lengthOf(1);
      const sessionSpan = scopeSpan?.spans[0] as ExportedSpan;
      expect(sessionSpan['name']).to.be.equal('emb-session-part');

      const attrRecord = otlpAttrsToRecord(sessionSpan['attributes']);

      const userSessionId = attrRecord['emb.user_session_id'];
      const userSessionStartTs = attrRecord['emb.user_session_start_ts'];
      const sdkStartupDuration = attrRecord['emb.sdk_startup_duration'];
      const browserUrlFull = attrRecord['browser.url.full'];

      expect(userSessionId)
        .to.be.a('string')
        .and.match(/^[0-9A-F]{32}$/);
      expect(sessionPartId).to.match(/^[0-9A-F]{32}$/);
      expect(userSessionStartTs).to.be.a('number').and.greaterThan(0);
      expect(sdkStartupDuration)
        .to.be.a('number')
        .and.greaterThan(0)
        .and.lessThan(100);
      expect(browserUrlFull).to.be.a('string').and.match(/^http/);

      expect(attrRecord).to.deep.equal({
        'emb.type': 'ux.session_part',
        'emb.state': 'foreground',
        'emb.session_part_id': sessionPartId,
        'emb.session_part_start_reason': 'init',
        'emb.session_part_end_reason': 'user_session_ended',
        'emb.cold_start': true,
        'emb.page_load': true,
        'emb.is_final_session_part': 1,
        'emb.user_session_termination_reason': 'manual',
        'emb.user_session_id': userSessionId,
        'emb.user_session_previous_id': '',
        'emb.user_session_number': 1,
        'emb.user_session_part_index': 1,
        'emb.session_part_number': 1,
        'emb.user_session_start_ts': userSessionStartTs,
        'emb.user_session_max_duration_seconds': 43200,
        'emb.user_session_inactivity_timeout_seconds': 1800,
        'emb.user_session_foreground_inactivity_timeout_seconds': 1800,
        'emb.sdk_startup_duration': sdkStartupDuration,
        'browser.url.full': browserUrlFull,
        'app.surface.name': window.location.pathname,
        'app.surface.id': appSurfaceId,
      });
    });

    it('should allow user resource to override service.name but not other SDK attributes', async () => {
      fakeFetchRespondWith('');

      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        resource: resourceFromAttributes({
          'service.name': 'my-custom-service',
          // Attempt to override non-overridable SDK attributes
          'telemetry.sdk.name': 'my-custom-sdk',
          app_framework: 99,
          sdk_platform: 'my-custom-platform',
        }),
        defaultInstrumentationConfig: {
          omit: new Set([
            '@opentelemetry/instrumentation-fetch',
            'document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise((r) => setTimeout(r, 1));

      session.endUserSession();

      // Needed to allow the transport to actually send its data off to fetch
      await new Promise((r) => setTimeout(r, 1));

      const body = fakeFetchGetSpansBody();
      void expect(body).not.to.be.null;
      const decompressedStream = new Response(body).body?.pipeThrough(
        new DecompressionStream('gzip'),
      );
      const text = await new Response(decompressedStream).text();
      const parsed = JSON.parse(text) as never;

      const resource = parsed['resourceSpans'][0]['resource'];
      expect(resource).to.containSubset({
        attributes: [
          // service.name is overridable — user value wins
          { key: 'service.name', value: { stringValue: 'my-custom-service' } },
          // All other SDK attributes are not overridable — SDK values win
          {
            key: 'telemetry.sdk.name',
            value: { stringValue: 'embrace-web-sdk' },
          },
          { key: 'app_framework', value: { intValue: 1 } },
          { key: 'sdk_platform', value: { stringValue: 'web' } },
        ],
      });
    });

    it('should not include unfinished spans ', async () => {
      fakeFetchRespondWith('');
      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            'document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise((r) => setTimeout(r, 1));

      embtrace.startSpan('my performance span').end();
      // shouldn't get exported
      embtrace.startSpan('my unfinished performance span');

      session
        .getUserSessionManager()
        .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

      const exportedSpans = await getLastSessionExportedSpans(0);

      expect(exportedSpans[0]['name']).to.be.equal('my performance span');
    });

    it('should apply a max on the number of spans recorded per session', async () => {
      fakeFetchRespondWith('');
      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            'document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise((r) => setTimeout(r, 1));

      // Capped at 1000 spans per session
      for (let i = 0; i < 1100; i++) {
        embtrace.startSpan(`my-span-${i.toString()}`).end();
      }

      session
        .getUserSessionManager()
        .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

      const exportedSpans = await getLastSessionExportedSpans(0);
      expect(exportedSpans).to.have.lengthOf(1000);
      for (let i = 0; i < exportedSpans.length; i++) {
        expect(exportedSpans[i]['name']).to.equal(`my-span-${i.toString()}`);
      }

      fakeFetchResetHistory();

      session
        .getUserSessionManager()
        .startSessionPartInternal({ reason: 'init' });

      // Limit should be reset for the next session
      for (let i = 0; i < 100; i++) {
        embtrace.startSpan(`my-next-session-span-${i.toString()}`).end();
      }

      session
        .getUserSessionManager()
        .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

      const nextSessionExportedSpans = await getLastSessionExportedSpans(0);
      expect(nextSessionExportedSpans).to.have.lengthOf(100);
      for (let i = 0; i < nextSessionExportedSpans.length; i++) {
        expect(nextSessionExportedSpans[i]['name']).to.equal(
          `my-next-session-span-${i.toString()}`,
        );
      }
    });

    it('should apply limits on the events of an individual span', async () => {
      fakeFetchRespondWith('');
      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            'document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise((r) => setTimeout(r, 1));

      const span = embtrace.startSpan('my-span');

      // Capped at 200 events per span
      for (let i = 0; i < 300; i++) {
        span.addEvent(`span-event-${i.toString()}`);
      }

      span.end();
      session
        .getUserSessionManager()
        .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

      const exportedSpans = await getLastSessionExportedSpans(0);
      expect(exportedSpans).to.have.lengthOf(1);

      const exportedEvents = exportedSpans[0].events;
      expect(exportedEvents).to.have.lengthOf(200);

      for (let i = 0; i < exportedEvents.length; i++) {
        // Default OTel limiting of events drops the oldest events when the limit
        // is reached, because we went 100 over the limit that means we dropped the first 100:
        // https://github.com/open-telemetry/opentelemetry-js/blob/8505a6147e3834e04ce546dfc50e5d8fc50b1837/packages/opentelemetry-sdk-trace-base/src/Span.ts#L210
        const expected = i + 100;
        expect(exportedEvents[i]['name']).to.equal(
          `span-event-${expected.toString()}`,
        );
      }
    });

    it('should apply limits on the number of attributes of an individual span', async () => {
      fakeFetchRespondWith('');
      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            'document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise((r) => setTimeout(r, 1));

      const span = embtrace.startSpan('my-span');

      // Capped at 200 attributes per span
      for (let i = 0; i < 300; i++) {
        span.setAttribute(`span-attribute-${i.toString()}`, i.toString());
      }

      span.end();
      session
        .getUserSessionManager()
        .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

      const exportedSpans = await getLastSessionExportedSpans(0);
      expect(exportedSpans).to.have.lengthOf(1);

      const exportedAttributes = exportedSpans[0].attributes;
      // 200 is the span attribute cap; three additional attributes are
      // written directly to span.attributes by later processors at onEnd,
      // bypassing the cap: browser.url.full (BrowserSpanProcessor) and
      // app.surface.name/app.surface.id (PageSpanProcessor — stamped on
      // every span since EmbracePageManager always has a current route).
      expect(exportedAttributes).to.have.lengthOf(203);

      // Only emb.type hits the cap via setAttribute at onStart (from startSpan's
      // attributes option). Non-part spans no longer carry session IDs; the
      // session-part span itself is the only span stamped, and correlation for
      // everything else happens server-side via the batched envelope. Newest
      // attributes are dropped when the limit is reached, so the first 199
      // span-attribute-N entries survive.
      expect(exportedAttributes[0].key).to.equal('emb.type');
      for (let i = 1; i < 200; i++) {
        const expected = i - 1;
        expect(exportedAttributes[i].key).to.equal(
          `span-attribute-${expected.toString()}`,
        );
        expect(exportedAttributes[i].value).to.deep.equal({
          stringValue: expected.toString(),
        });
      }
      const bypassKeys = exportedAttributes
        .slice(200)
        .map((a: { key: string }) => a.key);
      expect(bypassKeys).to.have.members([
        'browser.url.full',
        'app.surface.name',
        'app.surface.id',
      ]);
    });

    // Not being applied currently, this appears to be a bug in OTel package, the relevant config isn't actually being
    // used:
    // https://github.com/search?q=repo%3Aopen-telemetry%2Fopentelemetry-js+attributePerEventCountLimit&type=code
    // biome-ignore lint/suspicious/noSkippedTests: waiting on OTel bugfix https://github.com/open-telemetry/opentelemetry-js/pull/6479
    xit('should apply limits on the attributes of an individual span event', async () => {
      fakeFetchRespondWith('');
      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            'document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise((r) => setTimeout(r, 1));

      const span = embtrace.startSpan('my-span');
      const spanEventAttributes: Record<string, string> = {};

      // Capped at 20 attributes per span event
      for (let i = 0; i < 40; i++) {
        spanEventAttributes[`span-event-attribute-${i.toString()}`] =
          i.toString();
      }

      span.addEvent('span-event', spanEventAttributes);
      span.end();
      session
        .getUserSessionManager()
        .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

      const exportedSpans = await getLastSessionExportedSpans(0);
      expect(exportedSpans).to.have.lengthOf(1);

      const exportedEvents = exportedSpans[0].events;
      expect(exportedEvents).to.have.lengthOf(1);

      expect(exportedEvents[0].attributes).to.have.lengthOf(20);
    });

    it('should apply default data scrubbing to span and log url attribute values', async () => {
      fakeFetchRespondWith('');
      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        logExporters: [logExporter],
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // These instrumentations generate entries in the test environment that interfere with assertions
            'document-load',
            'dom-state',
            'loaf',
            'web-vital',
            'max-scroll-depth',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise((r) => setTimeout(r, 1));

      embtrace
        .startSpan('my-span', {
          attributes: {
            'url.full':
              'https://example.com/some/path/?foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
            safe: 'some other attr',
          },
        })
        .end();

      log.message('my custom log', 'info', {
        attributes: {
          'url.path':
            'https://username:password@www.example.com/some/other/path',
          'url.query': 'foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
          safe: 'some other attr',
        },
      });

      session
        .getUserSessionManager()
        .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

      if (result) {
        await result.flush();
      }

      const exportedSpans = await getLastSessionExportedSpans(0);
      expect(exportedSpans).to.have.lengthOf(1);
      expect(exportedSpans[0].attributes[0]).to.deep.equal({
        key: 'url.full',
        value: {
          stringValue:
            'https://example.com/some/path/?foo=bar&pw=REDACTED&foopw=safe&AWSAccessKeyId=REDACTED',
        },
      });
      expect(exportedSpans[0].attributes[1]).to.deep.equal({
        key: 'safe',
        value: {
          stringValue: 'some other attr',
        },
      });

      const finishedLogRecords = logExporter.getFinishedLogRecords();
      expect(finishedLogRecords).to.have.lengthOf(1);
      expect(finishedLogRecords[0].attributes['url.path']).to.be.equal(
        'https://REDACTED:REDACTED@www.example.com/some/other/path',
      );
      expect(finishedLogRecords[0].attributes['url.query']).to.be.equal(
        'foo=bar&pw=REDACTED&foopw=safe&AWSAccessKeyId=REDACTED',
      );
      expect(finishedLogRecords[0].attributes['safe']).to.be.equal(
        'some other attr',
      );
    });

    it('should allow default data scrubbing to be turned off', async () => {
      fakeFetchRespondWith('');
      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        enableDefaultAttributeScrubbing: false,
        logExporters: [logExporter],
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // These instrumentations generate entries in the test environment that interfere with assertions
            'document-load',
            'dom-state',
            'loaf',
            'web-vital',
            'max-scroll-depth',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise((r) => setTimeout(r, 1));

      embtrace
        .startSpan('my-span', {
          attributes: {
            'url.full':
              'https://example.com/some/path/?foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
            safe: 'some other attr',
          },
        })
        .end();

      log.message('my custom log', 'info', {
        attributes: {
          'url.path':
            'https://username:password@www.example.com/some/other/path',
          'url.query': 'foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
          safe: 'some other attr',
        },
      });

      session
        .getUserSessionManager()
        .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

      if (result) {
        await result.flush();
      }

      const exportedSpans = await getLastSessionExportedSpans(0);
      expect(exportedSpans).to.have.lengthOf(1);
      expect(exportedSpans[0].attributes[0]).to.deep.equal({
        key: 'url.full',
        value: {
          stringValue:
            'https://example.com/some/path/?foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
        },
      });
      expect(exportedSpans[0].attributes[1]).to.deep.equal({
        key: 'safe',
        value: {
          stringValue: 'some other attr',
        },
      });

      const finishedLogRecords = logExporter.getFinishedLogRecords();
      expect(finishedLogRecords).to.have.lengthOf(1);
      expect(finishedLogRecords[0].attributes['url.path']).to.be.equal(
        'https://username:password@www.example.com/some/other/path',
      );
      expect(finishedLogRecords[0].attributes['url.query']).to.be.equal(
        'foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
      );
      expect(finishedLogRecords[0].attributes['safe']).to.be.equal(
        'some other attr',
      );
    });

    it('should allow custom attribute scrubbers and query string tokens to be specified', async () => {
      fakeFetchRespondWith('');
      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        logExporters: [logExporter],
        attributeScrubbers: [
          { key: 'safe', scrub: (value) => `${value} ALTERED` },
        ],
        additionalQueryParamsToScrub: ['foo'],
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // These instrumentations generate entries in the test environment that interfere with assertions
            'document-load',
            'dom-state',
            'loaf',
            'web-vital',
            'max-scroll-depth',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise((r) => setTimeout(r, 1));

      embtrace
        .startSpan('my-span', {
          attributes: {
            'url.full':
              'https://example.com/some/path/?foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
            safe: 'some other attr',
          },
        })
        .end();

      log.message('my custom log', 'info', {
        attributes: {
          'url.path':
            'https://username:password@www.example.com/some/other/path',
          'url.query': 'foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey',
          safe: 'some other attr',
        },
      });

      session
        .getUserSessionManager()
        .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

      if (result) {
        await result.flush();
      }

      const exportedSpans = await getLastSessionExportedSpans(0);
      expect(exportedSpans).to.have.lengthOf(1);
      expect(exportedSpans[0].attributes[0]).to.deep.equal({
        key: 'url.full',
        value: {
          stringValue:
            'https://example.com/some/path/?foo=REDACTED&pw=REDACTED&foopw=safe&AWSAccessKeyId=REDACTED',
        },
      });
      expect(exportedSpans[0].attributes[1]).to.deep.equal({
        key: 'safe',
        value: {
          stringValue: 'some other attr ALTERED',
        },
      });

      const finishedLogRecords = logExporter.getFinishedLogRecords();
      expect(finishedLogRecords).to.have.lengthOf(1);
      expect(finishedLogRecords[0].attributes['url.path']).to.be.equal(
        'https://REDACTED:REDACTED@www.example.com/some/other/path',
      );
      expect(finishedLogRecords[0].attributes['url.query']).to.be.equal(
        'foo=REDACTED&pw=REDACTED&foopw=safe&AWSAccessKeyId=REDACTED',
      );
      expect(finishedLogRecords[0].attributes['safe']).to.be.equal(
        'some other attr ALTERED',
      );
    });

    it('should refresh the remote config using Embrace if not dynamic config manager is provided', () => {
      fakeFetchRespondWith(
        JSON.stringify({
          threshold: 90,
        }),
      );

      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            'document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      void expect(fakeFetchWasCalled()).to.be.true;
      expect(fakeFetchGetConfigUrl()).to.contain(
        'https://a-abc12.config.emb-api.com/v2/config?appId=abc12&osVersion=1&appVersion=my-app-version&deviceId=',
      );
    });

    it('should refresh the remote config using the template app version if one is not provided', () => {
      fakeFetchRespondWith(
        JSON.stringify({
          threshold: 90,
        }),
      );

      const result = initSDK({
        appID: 'abc12',
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            'document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      void expect(fakeFetchWasCalled()).to.be.true;
      expect(fakeFetchGetConfigUrl()).to.contain(
        'https://a-abc12.config.emb-api.com/v2/config?appId=abc12&osVersion=1&appVersion=EmbIOAppVersionX.X.X&deviceId=',
      );
    });

    it('should disable the SDK', () => {
      const noOpLogManager = new NoOpLogManager();
      const noOpTraceManager = new NoOpTraceManager();
      const noOpUserSessionManager = new NoOpUserSessionManager();
      const noOpUserManager = new NoOpUserManager();

      log.setGlobalLogManager(noOpLogManager);
      embtrace.setGlobalTraceManager(noOpTraceManager);
      session.setGlobalUserSessionManager(noOpUserSessionManager);
      user.setGlobalUserManager(noOpUserManager);

      const myCustomConfigManager: DynamicConfigManager = {
        refreshRemoteConfig: sinon.stub(),
        setConfig: sinon.stub(),
        getConfig: () => ({
          samplingPct: 0,
        }),
      };

      const diagLogger = new InMemoryDiagLogger();
      const result = initSDK({
        appID: 'abc12',
        diagLogger,
        dynamicSDKConfigManager: myCustomConfigManager,
        logExporters: [logExporter],
        spanExporters: [spanExporter],
      });
      void expect(result).to.be.false;
      expect(diagLogger.getDebugLogs()).to.be.deep.equal([
        'No existing app instance ID found in session storage, creating a new one',
        'SDK is disabled, skipping initialization.',
      ]);

      // All public APIs should be no-ops and not throw errors
      // Test a few no-op public APIs, this should be covered in other tests but
      // is worth double-checking that we're not registering any manager
      expect(() => {
        const currentContext = context.active();

        // trace
        embtrace.getSpan(currentContext);
        embtrace.setSpan(currentContext, embtrace.startSpan('Test Span'));
        const span = embtrace.startSpan('Test Span');
        void expect(span.isRecording()).to.be.false;
        span.addEvent('Test Event');
        span.setAttribute('Test Attribute', 'Test Value');
        span.fail();
        span.end();

        // log
        log.message('Test Log', 'info');
        log.logException(new Error('Test Error'));

        // user
        user.setUserId('test-user-id');
        user.clearUserId();
        user.getEmbraceUserId();

        // user session (using deprecated method names)
        session.getSessionId();
        session.getSessionSpan();
        session.getSessionStartTime();
        session.addProperty('r1', 'my-resource-attr');
        session.removeProperty('r2');
      }).to.not.throw();

      expect(logExporter.getFinishedLogRecords()).to.have.lengthOf(0);
      expect(spanExporter.getFinishedSpans()).to.have.lengthOf(0);
    });
  });

  describe('soft navigation correlation', () => {
    it('does not stamp correlation attributes when soft-nav is omitted', async () => {
      fakeFetchRespondWith('');
      initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        defaultInstrumentationConfig: {
          omit: new Set([
            '@opentelemetry/instrumentation-fetch',
            'document-load',
            'soft-navigation-performance',
          ]),
        },
      });
      await new Promise((r) => setTimeout(r, 1));

      const base = Date.now();
      const softNav = embtrace.startSpan('Soft Navigation', {
        startTime: base + 900,
        attributes: { 'emb.soft_navigation.source': 'polyfill' },
      });
      softNav.end(base + 2000);
      session
        .getUserSessionManager()
        .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

      const exportedSpans = await getLastSessionExportedSpans(0);
      const softNavSpan = exportedSpans.find(
        (s: { name: string }) => s.name === 'Soft Navigation',
      );
      const spanIdsAttr = softNavSpan?.attributes.find(
        (a: { key: string }) => a.key === 'emb.soft_navigation.span_ids',
      );
      void expect(spanIdsAttr).to.be.undefined;
    });
  });

  describe('console logging', () => {
    let consoleErrorStub: SinonStub;
    let consoleWarnStub: SinonStub;
    let consoleInfoStub: SinonStub;
    let setLoggerStub: SinonStub;

    beforeEach(() => {
      consoleErrorStub = sinon.stub();
      consoleWarnStub = sinon.stub();
      consoleInfoStub = sinon.stub();
      setLoggerStub = stubDiagLoggerMethods({
        error: consoleErrorStub,
        warn: consoleWarnStub,
        info: consoleInfoStub,
      });
    });

    afterEach(() => {
      setLoggerStub.restore();
    });

    it('should allow sending info level logs to the console', () => {
      const result = initSDK({ appID: 'abc12', logLevel: DiagLogLevel.INFO });
      void expect(result).not.to.be.false;
      const diagLogger = diag.createComponentLogger({ namespace: 'testing' });

      diagLogger.info('info');
      diagLogger.warn('warning');
      diagLogger.error('error');

      void expect(consoleInfoStub).to.have.callCount(2);
      void expect(
        consoleInfoStub.calledWith(
          'embrace-sdk',
          'successfully initialized the SDK',
        ),
      ).to.be.true;
      void expect(consoleInfoStub.calledWith('testing', 'info')).to.be.true;
      void expect(consoleWarnStub.calledOnce).to.be.true;
      void expect(consoleErrorStub.calledOnce).to.be.true;
    });

    it('should allow sending warning level logs to the console', () => {
      const result = initSDK({ appID: 'abc12', logLevel: DiagLogLevel.WARN });
      void expect(result).not.to.be.false;
      const diagLogger = diag.createComponentLogger({ namespace: 'testing' });

      diagLogger.info('info');
      diagLogger.warn('warning');
      diagLogger.error('error');

      void expect(consoleInfoStub.called).to.be.false;
      void expect(consoleWarnStub.calledOnce).to.be.true;
      void expect(consoleErrorStub.calledOnce).to.be.true;
    });

    it('should default to error level logging', () => {
      const result = initSDK({ appID: 'abc12' });
      void expect(result).not.to.be.false;
      const diagLogger = diag.createComponentLogger({ namespace: 'testing' });

      diagLogger.info('info');
      diagLogger.warn('warning');
      diagLogger.error('error');

      void expect(consoleInfoStub.called).to.be.false;
      void expect(consoleWarnStub.called).to.be.false;
      void expect(consoleErrorStub.calledOnce).to.be.true;
    });
  });

  describe('multiple invocations', () => {
    let consoleErrorStub: SinonStub;
    let consoleWarnStub: SinonStub;
    let setLoggerStub: SinonStub;

    beforeEach(() => {
      consoleErrorStub = sinon.stub();
      consoleWarnStub = sinon.stub();
      setLoggerStub = stubDiagLoggerMethods({
        error: consoleErrorStub,
        warn: consoleWarnStub,
      });
    });

    afterEach(() => {
      setLoggerStub.restore();
    });

    it('should not cause the SDK to be initialized multiple times', () => {
      const testWebVitalListeners = setupTestWebVitalListeners();

      const result1 = initSDK({
        logExporters: [logExporter],
        spanExporters: [spanExporter],
        logLevel: DiagLogLevel.WARN,
        defaultInstrumentationConfig: {
          omit: new Set(['web-vital']),
          'web-vital': { listeners: testWebVitalListeners.listeners },
        },
      });
      void expect(result1).not.to.be.false;
      void expect(testWebVitalListeners.clsStub.called).to.be.false;

      // 2nd invocation does not omit the web vital instrumentation, this should be ignored since only the first
      // invocation initialized the SDK
      const result2 = initSDK({
        logExporters: [logExporter],
        spanExporters: [spanExporter],
        defaultInstrumentationConfig: {
          'web-vital': { listeners: testWebVitalListeners.listeners },
        },
      });
      void expect(result2).not.to.be.false;
      void expect(testWebVitalListeners.clsStub.called).to.be.false;

      void expect(
        consoleWarnStub.calledWith(
          'embrace-sdk',
          'SDK has already been successfully initialized, skipping this invocation of initSDK',
        ),
      ).to.be.true;
    });

    it('should still initialize the SDK if previous init calls were not successful', () => {
      const testWebVitalListeners = setupTestWebVitalListeners();

      const result1 = initSDK({
        appID: 'invalid',
        logExporters: [logExporter],
        spanExporters: [spanExporter],
        logLevel: DiagLogLevel.WARN,
        defaultInstrumentationConfig: {
          omit: new Set(['web-vital']),
          'web-vital': { listeners: testWebVitalListeners.listeners },
        },
      });
      void expect(result1).to.be.false;
      void expect(testWebVitalListeners.clsStub.called).to.be.false;
      void expect(
        consoleWarnStub.calledWith(
          'embrace-sdk',
          'failed to initialize the SDK: appID should be 5 characters long',
        ),
      ).to.be.false;

      // 2nd invocation does not omit the web vital instrumentation, this should take effect since the first
      // invocation failed to initialize the SDK
      const result2 = initSDK({
        logExporters: [logExporter],
        spanExporters: [spanExporter],
        defaultInstrumentationConfig: {
          'web-vital': { listeners: testWebVitalListeners.listeners },
        },
      });
      void expect(result2).not.to.be.false;
      // Called twice, one for the actual reports and one for the urlAttribution
      void expect(testWebVitalListeners.clsStub.calledTwice).to.be.true;

      void expect(
        consoleWarnStub.calledWith(
          'embrace-sdk',
          'SDK has already been successfully initialized, skipping this invocation of initSDK',
        ),
      ).to.be.false;
    });
  });

  describe('Network span forwarding', () => {
    let clock: sinon.SinonFakeTimers;
    let xhrStub: SinonStub;

    beforeEach(() => {
      xhrStub = sinon.stub(window.XMLHttpRequest.prototype, 'send');
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      xhrStub.restore();
      clock.restore();
      propagation.disable();
    });

    const BASE_CONFIG: SDKInitConfig = {
      appID: 'abc12',
      appVersion: 'my-app-version',
      defaultInstrumentationConfig: {
        omit: new Set([
          // Document load instrumentation generates a bunch of spans in this test environment
          'document-load',
        ]),
      },
      dynamicSDKConfigManager: {
        refreshRemoteConfig: sinon.stub(),
        setConfig: sinon.stub(),
        getConfig: () => ({
          samplingPct: 100,
          networkSpansForwardingThreshold: 100,
        }),
      },
    };

    type NSFTest = {
      name: string;
      sdkConfig: SDKInitConfig;
      networkType: 'fetch' | 'xhr';
      expectInjection: boolean;
    };

    const tests: NSFTest[] = [
      {
        name: 'should inject the header and add the correct span attribute when enabled using fetch',
        sdkConfig: BASE_CONFIG,
        networkType: 'fetch',
        expectInjection: true,
      },
      {
        name: 'should inject the header and add the correct span attribute when enabled using xhr',
        sdkConfig: BASE_CONFIG,
        networkType: 'xhr',
        expectInjection: true,
      },
      {
        name: 'should not do the injection with fetch when the feature has been blocked through local config',
        sdkConfig: {
          ...BASE_CONFIG,
          blockNetworkSpanForwarding: true,
        },
        networkType: 'fetch',
        expectInjection: false,
      },
      {
        name: 'should not do the injection with xhr when the feature has been blocked through local config',
        sdkConfig: {
          ...BASE_CONFIG,
          blockNetworkSpanForwarding: true,
        },
        networkType: 'xhr',
        expectInjection: false,
      },
      {
        name: 'should not do the injection with fetch when the feature is not enabled through dynamic config',
        sdkConfig: {
          ...BASE_CONFIG,
          dynamicSDKConfigManager: {
            refreshRemoteConfig: sinon.stub(),
            setConfig: sinon.stub(),
            getConfig: () => ({
              samplingPct: 100,
              networkSpansForwardingThreshold: 0,
            }),
          },
        },
        networkType: 'fetch',
        expectInjection: false,
      },
      {
        name: 'should not do the injection with xhr when the feature is not enabled through dynamic config',
        sdkConfig: {
          ...BASE_CONFIG,
          dynamicSDKConfigManager: {
            refreshRemoteConfig: sinon.stub(),
            setConfig: sinon.stub(),
            getConfig: () => ({
              samplingPct: 100,
              networkSpansForwardingThreshold: 0,
            }),
          },
        },
        networkType: 'xhr',
        expectInjection: false,
      },
      {
        name: 'should not do the injection with fetch by default',
        sdkConfig: {
          ...BASE_CONFIG,
          dynamicSDKConfigManager: undefined,
        },
        networkType: 'fetch',
        expectInjection: false,
      },
      {
        name: 'should not do the injection with xhr by default',
        sdkConfig: {
          ...BASE_CONFIG,
          dynamicSDKConfigManager: undefined,
        },
        networkType: 'xhr',
        expectInjection: false,
      },
      {
        name: 'should not do the injection with fetch when there is an unsupported config',
        sdkConfig: {
          ...BASE_CONFIG,
          propagator: new CompositePropagator(),
        },
        networkType: 'fetch',
        expectInjection: false,
      },
      {
        name: 'should not do the injection with xhr when there is an unsupported config',
        sdkConfig: {
          ...BASE_CONFIG,
          propagator: new CompositePropagator(),
        },
        networkType: 'xhr',
        expectInjection: false,
      },
    ];

    tests.forEach((test) => {
      it(test.name, async () => {
        const result = initSDK(test.sdkConfig);
        void expect(result).not.to.be.false;

        // Wipe any initial calls made from refreshRemoteConfig()
        fetchStub.resetHistory();

        let injectedTraceparentHeader = '';
        if (test.networkType === 'fetch') {
          await fetch('something');
          clock.tick(1000);

          const headers = (fetchStub.lastCall.args[1] as RequestInit)
            .headers as Headers;
          if (test.expectInjection) {
            expect(headers.get('traceparent')).to.not.be.null;
            injectedTraceparentHeader =
              headers.get('traceparent') ?? "this shouldn't be empty";
          } else {
            expect(headers.get('traceparent')).to.be.null;
          }
        } else {
          const req = new XMLHttpRequest();
          const setHeaderStub = sinon.stub(req, 'setRequestHeader');
          req.open('GET', 'something', true);
          req.send();
          req.dispatchEvent(new ProgressEvent('load'));
          clock.tick(1000);

          if (test.expectInjection) {
            expect(setHeaderStub.lastCall.args[0]).to.be.equal('traceparent');
            injectedTraceparentHeader = setHeaderStub.lastCall.args[1];
          } else {
            expect(setHeaderStub.called).to.equal(false);
          }
        }

        session
          .getUserSessionManager()
          .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

        // Need to restore the clock here so that the setTimeout in `getLastSessionExportedSpans` works
        clock.restore();
        const exportedSpans = await getLastSessionExportedSpans(0, {
          name:
            test.networkType === 'fetch'
              ? '@opentelemetry/instrumentation-fetch'
              : '@opentelemetry/instrumentation-xml-http-request',
          version: '0.221.0',
        });
        expect(exportedSpans).to.have.lengthOf(1);
        const networkSpan = exportedSpans[0];
        const expectedTraceparent = `00-${networkSpan.traceId}-${networkSpan.spanId}-01`;

        expect(networkSpan.name).to.be.equal('GET');
        let foundW3CAttr = false;
        networkSpan.attributes.forEach((attr) => {
          if (attr.key === 'emb.w3c_traceparent') {
            foundW3CAttr = true;

            if (test.expectInjection) {
              expect(attr.value.stringValue).to.equal(expectedTraceparent);
            }
          }
        });
        expect(foundW3CAttr).to.equal(test.expectInjection);
        expect(injectedTraceparentHeader).to.equal(
          test.expectInjection ? expectedTraceparent : '',
        );
      });
    });
  });

  describe('SDK zero time reset listeners', () => {
    it('advances the SDK zero time when the browser fires pageshow', () => {
      const result = initSDK({
        logExporters: [logExporter],
        spanExporters: [spanExporter],
      });
      void expect(result).not.to.be.false;

      const perf = new OTelPerformanceManager();
      const zeroTimeBefore = perf.getZeroTime();

      window.dispatchEvent(new Event('pageshow'));

      expect(perf.getZeroTime()).to.be.greaterThan(zeroTimeBefore);
    });
  });
});

describe('isolated instances', () => {
  let spanExporter: InMemorySpanExporter;
  let logExporter: InMemoryLogRecordExporter;

  before(() => {
    spanExporter = new InMemorySpanExporter();
    logExporter = new InMemoryLogRecordExporter();
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fakeFetchInstall();
  });

  afterEach(() => {
    spanExporter.reset();
    logExporter.reset();
    fakeFetchRestore();
  });

  // Poll for localStorage keys to be set, avoiding flaky fixed timeouts
  const waitForLocalStorageKeys = async (
    keys: string[],
    timeout = 1000,
  ): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (keys.every((key) => localStorage.getItem(key) !== null)) {
        return;
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    const missing = keys.filter((key) => localStorage.getItem(key) === null);
    throw new Error(
      `Timed out waiting for localStorage keys: ${missing.join(', ')}`,
    );
  };

  it('should allow multiple isolated instances', () => {
    const firstSDKInstance = initSDK({
      logExporters: [logExporter],
      spanExporters: [spanExporter],
      registerGlobally: false,
    });

    const secondSDKInstance = initSDK({
      logExporters: [logExporter],
      spanExporters: [spanExporter],
      registerGlobally: false,
    });

    void expect(firstSDKInstance).not.to.be.false;
    void expect(secondSDKInstance).not.to.be.false;
    void expect(firstSDKInstance).to.not.equal(secondSDKInstance);
  });

  it('should not register any provider globally', async () => {
    const result = initSDK({
      logExporters: [logExporter],
      spanExporters: [spanExporter],
      registerGlobally: false,
      // The instance's own default instrumentations emit on their own schedule,
      // so leaving them on makes a zero-signal assertion depend on whether they
      // land before or after the flush.
      defaultInstrumentationConfig: {
        omit: new Set([
          'document-load',
          'loaf',
          'web-vital',
          'max-scroll-depth',
        ]),
      },
    });

    void expect(result).not.to.be.false;

    if (!result) {
      throw new Error('SDK failed to initialize');
    }

    const tracer = trace.getTracer('test-tracer');
    const span = tracer.startSpan('test-span');
    span.end();

    await result.flush();

    expect(spanExporter.getFinishedSpans()).to.have.lengthOf(0);

    const logger = logs.getLogger('test-logger');
    logger.emit({
      body: 'test log',
      severityNumber: SeverityNumber.INFO,
    });

    await result.flush();

    expect(logExporter.getFinishedLogRecords()).to.have.lengthOf(0);

    // Deprecated public path — must be a no-op against the unregistered global.
    session.endSessionSpan();
    // New internal path through the proxy's underlying manager — also a no-op.
    session
      .getUserSessionManager()
      .endSessionPartInternal({ reason: 'web_foreground_inactivity' });
    session
      .getUserSessionManager()
      .startSessionPartInternal({ reason: 'web_activity' });
    session
      .getUserSessionManager()
      .endSessionPartInternal({ reason: 'web_foreground_inactivity' });

    await result.flush();

    expect(spanExporter.getFinishedSpans()).to.have.lengthOf(0);
  });

  it('should export the dom-state view snapshot for an isolated instance', async () => {
    const isolatedLogExporter = new InMemoryLogRecordExporter();
    const result = initSDK({
      logExporters: [isolatedLogExporter],
      registerGlobally: false,
      defaultInstrumentationConfig: {
        omit: new Set([
          'document-load',
          'loaf',
          'web-vital',
          'max-scroll-depth',
        ]),
      },
    });

    void expect(result).not.to.be.false;

    if (!result) {
      throw new Error('SDK failed to initialize');
    }

    // The snapshot is captured when the instrumentation attaches (this page has
    // already loaded) and held until a part ends, so end the instance's user
    // session to flush it.
    const sessionPartId = (
      result.session as UserSessionManagerInternal
    ).getSessionPartId();
    void expect(sessionPartId).not.to.be.null;
    result.session.endUserSession();
    await result.flush();

    const record = isolatedLogExporter
      .getFinishedLogRecords()
      .find((r) => r.attributes['dom_state.phase'] === 'after_load');

    // The view snapshot must reach this instance's own exporter even though its
    // logger provider is only wired onto the instrumentation after construction.
    void expect(record).not.to.be.undefined;
    expect(record?.attributes['dom_state.images_above_fold']).to.be.a('number');
    // The part id rides from capture; hold-and-flush exists so the emit-stamped
    // user session and page correlation still match that part at send time.
    expect(record?.attributes['emb.session_part_id']).to.equal(sessionPartId);
  });

  it('should allow each instance to emit its own telemetry from the provided managers', async () => {
    const firstSDKInstrumentation = new FakeInstrumentation();
    const firstSDKInstance = initSDK({
      logExporters: [logExporter],
      spanExporters: [spanExporter],
      instrumentations: [firstSDKInstrumentation],
      registerGlobally: false,
      // Disable as it was creating too many spans making it harder to test
      defaultInstrumentationConfig: {
        omit: new Set([
          'document-load',
          'dom-state',
          'loaf',
          'web-vital',
          'max-scroll-depth',
        ]),
      },
    });

    const secondSDKInstrumentation = new FakeInstrumentation();
    const secondSpanExporter = new InMemorySpanExporter();
    const secondLogExporter = new InMemoryLogRecordExporter();
    const secondSDKInstance = initSDK({
      logExporters: [secondLogExporter],
      spanExporters: [secondSpanExporter],
      instrumentations: [secondSDKInstrumentation],
      registerGlobally: false,
      defaultInstrumentationConfig: {
        omit: new Set([
          'document-load',
          'dom-state',
          'loaf',
          'web-vital',
          'max-scroll-depth',
        ]),
      },
    });

    void expect(firstSDKInstance).not.to.be.false;
    void expect(secondSDKInstance).not.to.be.false;

    if (!firstSDKInstance || !secondSDKInstance) {
      throw new Error('SDK instances should not be false');
    }

    const checkInstanceTelemetry = async (
      sdkInstance: SDKControl,
      logExporter: InMemoryLogRecordExporter,
      spanExporter: InMemorySpanExporter,
      instrumentation: FakeInstrumentation,
    ) => {
      expect(logExporter.getFinishedLogRecords()).to.have.lengthOf(0);
      expect(spanExporter.getFinishedSpans()).to.have.lengthOf(0);

      const internalSessionManager =
        sdkInstance.session as UserSessionManagerInternal;

      sdkInstance.log.message('some log', 'info');
      sdkInstance.trace.startSpan('some span').end();
      internalSessionManager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
      });
      internalSessionManager.startSessionPartInternal({
        reason: 'web_activity',
      });
      internalSessionManager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
      });
      instrumentation.emit();

      await sdkInstance.flush();

      const finishedLogRecords = logExporter.getFinishedLogRecords();

      expect(finishedLogRecords).to.have.lengthOf(2);
      expect(finishedLogRecords[0].body).to.equal('some log');
      expect(finishedLogRecords[1].body).to.equal('my log');

      const finishedSpans = spanExporter.getFinishedSpans();

      // Two emb-session-part spans are expected per instance: the init part
      // is ended explicitly, then a fresh activity part is opened and ended.
      // Each instance owns its own userSessionManager, so the parts are
      // isolated per instance and not shared. The activity part resumes on
      // the same route, so EmbracePageManager re-notifies NavigationInstrumentation
      // on session-part-start, giving it its own route span too.
      expect(finishedSpans).to.have.lengthOf(5);
      expect(finishedSpans[0].name).to.equal('some span');
      expect(finishedSpans[1].name).to.equal('emb-session-part');
      expect(
        finishedSpans[1].attributes['emb.session_part_start_reason'],
      ).to.equal('init');
      expect(
        finishedSpans[1].attributes['emb.session_part_end_reason'],
      ).to.equal('web_foreground_inactivity');
      expect(finishedSpans[2].name).to.equal(window.location.pathname);
      expect(finishedSpans[3].name).to.equal('emb-session-part');
      expect(
        finishedSpans[3].attributes['emb.session_part_start_reason'],
      ).to.equal('web_activity');
      expect(
        finishedSpans[3].attributes['emb.session_part_end_reason'],
      ).to.equal('web_foreground_inactivity');
      expect(finishedSpans[4].name).to.equal('my span');
    };

    await checkInstanceTelemetry(
      firstSDKInstance,
      logExporter,
      spanExporter,
      firstSDKInstrumentation,
    );

    await checkInstanceTelemetry(
      secondSDKInstance,
      secondLogExporter,
      secondSpanExporter,
      secondSDKInstrumentation,
    );
  });

  it('should namespace the storage for each instance based on appID', async () => {
    fakeFetchRespondWith(
      JSON.stringify({
        threshold: 90,
      }),
    );

    const firstSDKInstance = initSDK({
      appID: 'app11',
      appVersion: 'app-version',
      registerGlobally: false,
    });

    const secondSDKInstance = initSDK({
      appID: 'app22',
      appVersion: 'app-version',
      registerGlobally: false,
    });

    void expect(firstSDKInstance, 'first SDK instance failed to initialize').not
      .to.be.false;
    void expect(secondSDKInstance, 'second SDK instance failed to initialize')
      .not.to.be.false;

    // Wait for remote config to be fetched and stored for both instances
    await waitForLocalStorageKeys([
      'app11__embrace_remote_config',
      'app22__embrace_remote_config',
    ]);

    // First instance using namespaced storage
    expect(!!localStorage.getItem('app11__embrace_user_id')).to.equal(
      true,
      'first app did not store embrace user id',
    );
    expect(!!localStorage.getItem('app11__embrace_remote_config')).to.equal(
      true,
      'first app did not store remote config',
    );
    expect(!!sessionStorage.getItem('app11__embrace_app_instance_id')).to.equal(
      true,
      'first app did not store app instance id',
    );
    // Second instance using namespaced storage
    expect(!!localStorage.getItem('app22__embrace_user_id')).to.equal(
      true,
      'second app did not store embrace user id',
    );
    expect(!!localStorage.getItem('app22__embrace_remote_config')).to.equal(
      true,
      'second app did not store remote config',
    );
    expect(!!sessionStorage.getItem('app22__embrace_app_instance_id')).to.equal(
      true,
      'second app did not store app instance id',
    );
    // Nothing using storage without a prefix
    expect(!!localStorage.getItem('embrace_user_id')).to.equal(
      false,
      'found globally stored Embrace user id',
    );
    expect(!!localStorage.getItem('embrace_remote_config')).to.equal(
      false,
      'found globally stored remote config',
    );
    expect(!!sessionStorage.getItem('embrace_app_instance_id')).to.equal(
      false,
      'found globally stored app instance id',
    );
  });

  it('should not namespace the storage if there is no appID provided', async () => {
    fakeFetchRespondWith(
      JSON.stringify({
        threshold: 90,
      }),
    );

    const firstSDKInstance = initSDK({
      registerGlobally: false,
      logExporters: [logExporter],
      spanExporters: [spanExporter],
    });

    const secondSDKInstance = initSDK({
      appID: 'app22',
      appVersion: 'app-version',
      registerGlobally: false,
    });

    void expect(firstSDKInstance).not.to.be.false;
    void expect(secondSDKInstance).not.to.be.false;

    // Wait for remote config to be fetched and stored (only second instance has appID)
    await waitForLocalStorageKeys(['app22__embrace_remote_config']);

    // Second instance using namespaced storage
    expect(!!localStorage.getItem('app22__embrace_user_id')).to.equal(true);
    expect(!!localStorage.getItem('app22__embrace_remote_config')).to.equal(
      true,
    );
    expect(!!sessionStorage.getItem('app22__embrace_app_instance_id')).to.equal(
      true,
    );
    // First instance using storage without a prefix
    expect(!!localStorage.getItem('embrace_user_id')).to.equal(true);
    expect(!!sessionStorage.getItem('embrace_app_instance_id')).to.equal(true);
  });
});
