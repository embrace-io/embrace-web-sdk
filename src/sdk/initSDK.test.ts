import {
  context,
  DiagLogLevel,
  diag,
  propagation,
  trace,
} from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { CompositePropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import type { SinonStub } from 'sinon';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { MetricWithAttribution } from 'web-vitals/attribution';
import { log, NoOpLogManager, ProxyLogManager } from '../api-logs/index.ts';
import {
  NoOpSpanSessionManager,
  ProxySpanSessionManager,
  session,
} from '../api-sessions/index.ts';
import {
  trace as embtrace,
  NoOpTraceManager,
  ProxyTraceManager,
} from '../api-traces/index.ts';
import { NoOpUserManager, ProxyUserManager, user } from '../api-users/index.ts';
import type { WebVitalOnReport } from '../instrumentations/index.ts';
import {
  EmbraceLogManager,
  EmbraceSpanSessionManager,
  EmbraceTraceManager,
  EmbraceUserManager,
} from '../managers/index.ts';
import { SDK_VERSION } from '../resources/index.ts';
import {
  FakeInstrumentation,
  FakeLogRecordProcessor,
  FakeSpanProcessor,
  fakeFetchGetBody,
  fakeFetchGetRequestHeaders,
  fakeFetchGetUrl,
  fakeFetchInstall,
  fakeFetchResetHistory,
  fakeFetchRespondWith,
  fakeFetchRestore,
  fakeFetchWasCalled,
  InMemoryDiagLogger,
  setupTestWebVitalListeners,
} from '../testUtils/index.ts';
import { initSDK } from './initSDK.ts';
import { registry } from './registry.ts';
import type {
  DynamicConfigManager,
  SDKControl,
  SDKInitConfig,
} from './types.ts';

chai.use(sinonChai);
const { expect } = chai;

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
    };
  }[];
};

type SpanScope = {
  name: string;
  version?: string;
};

const getLastSessionExportedSpans = async (
  callNumber = 0,
  scope: SpanScope = { name: 'embrace-web-sdk-traces' },
) => {
  // Needed to allow the transport to actually send its data off to fetch
  await new Promise((r) => setTimeout(r, 1));

  const body = fakeFetchGetBody(callNumber);
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

  expect(resourceSpan['scopeSpans']).to.have.lengthOf(2);
  const sessionScopeSpan = resourceSpan['scopeSpans'][0];
  expect(sessionScopeSpan['scope']).to.deep.equal({
    name: 'embrace-web-sdk-sessions',
  });
  expect(sessionScopeSpan['spans']).to.have.lengthOf(1);
  expect(sessionScopeSpan['spans'][0]['name']).to.be.equal('emb-session');
  const otherScopeSpan = resourceSpan['scopeSpans'][1];
  expect(otherScopeSpan['scope']).to.deep.equal(scope);

  return otherScopeSpan['spans'] as ExportedSpan[];
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

  it('should require an app ID when not setting custom exporters', () => {
    const diagLogger = new InMemoryDiagLogger();
    // @ts-expect-error need to bypass type checking to test this invalid configuration
    const result = initSDK({ diagLogger });
    void expect(result).to.be.false;

    expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
    expect(diagLogger.getErrorLogs()[0]).to.equal(
      'failed to initialize the SDK: when the embrace appID is omitted then at least one logExporter or spanExporter must be set',
    );
  });

  it('should ensure the app ID is valid', () => {
    const diagLogger = new InMemoryDiagLogger();
    const result = initSDK({ appID: 'foo-app-id', diagLogger });
    void expect(result).to.be.false;

    expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
    expect(diagLogger.getErrorLogs()[0]).to.equal(
      'failed to initialize the SDK: appID should be 5 characters long',
    );
  });

  it('should allow setting custom instrumentations', async () => {
    const instrumentation = new FakeInstrumentation();
    const result = initSDK({
      logExporters: [logExporter],
      spanExporters: [spanExporter],
      instrumentations: [instrumentation],
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
    // Called twice, one for the actual reports and one for the urlAttribution
    void expect(testWebVitalListeners.clsStub.calledTwice).to.be.true;
    const { args } = testWebVitalListeners.clsStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

    metricReportFunc({
      name: 'CLS',
      value: 22,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {},
    } as MetricWithAttribution);

    session.getSpanSessionManager().endSessionSpan();
    if (result) {
      await result.flush();
    }

    const finishedSpans = spanExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);
    const clsEvent = sessionSpan.events[0];
    expect(clsEvent.name).to.be.equal('emb-web-vitals-report-CLS');
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

  it('should register all global managers', async () => {
    const result = initSDK({
      appID: 'abc12',
      logExporters: [logExporter],
      spanExporters: [spanExporter],
    });
    void expect(result).not.to.be.false;

    expect(log.getLogManager()).to.be.instanceOf(ProxyLogManager);
    expect(
      (log.getLogManager() as ProxyLogManager).getDelegate(),
    ).to.be.instanceOf(EmbraceLogManager);

    expect(session.getSpanSessionManager()).to.be.instanceOf(
      ProxySpanSessionManager,
    );
    expect(
      (
        session.getSpanSessionManager() as ProxySpanSessionManager
      ).getDelegate(),
    ).to.be.instanceOf(EmbraceSpanSessionManager);

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

      const sessionID = session.getSessionId();
      session.endSessionSpan();

      // Needed to allow the transport to actually send its data off to fetch
      await new Promise((r) => setTimeout(r, 1));

      const headers = fakeFetchGetRequestHeaders(1);
      expect((headers as Record<string, string>)['X-EM-AID']).to.equal('abc12');

      const body = fakeFetchGetBody(1);

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
      expect(resourceSpan['scopeSpans']).to.have.lengthOf(1);
      const scopeSpan = resourceSpan['scopeSpans'][0];
      expect(scopeSpan['scope']).to.deep.equal({
        name: 'embrace-web-sdk-sessions',
      });
      expect(scopeSpan['spans']).to.have.lengthOf(1);
      const sessionSpan = scopeSpan['spans'][0] as ExportedSpan;
      expect(sessionSpan['name']).to.be.equal('emb-session');

      const sessionNumber = sessionSpan['attributes'].find(
        (attr) => attr.key === 'emb.session_number',
      );
      void expect(sessionNumber?.value.intValue).not.to.be.undefined;
      expect(sessionNumber?.value.intValue).to.be.greaterThan(0);
      expect(sessionNumber?.value.intValue).to.be.lessThan(20);

      const startupDuration = sessionSpan['attributes'].find(
        (attr) => attr.key === 'emb.sdk_startup_duration',
      );
      void expect(startupDuration?.value.intValue).not.to.be.undefined;
      expect(startupDuration?.value.intValue).to.be.greaterThan(0);
      expect(startupDuration?.value.intValue).to.be.lessThan(100);

      const experienceId = sessionSpan['attributes'].find(
        (attr) => attr.key === 'emb.experience_id',
      )?.value.stringValue;
      void expect(experienceId).to.be.a('string');
      void expect(experienceId).to.have.lengthOf(32);

      const tabId = sessionSpan['attributes'].find(
        (attr) => attr.key === 'emb.tab_id',
      )?.value.stringValue;
      void expect(tabId).to.be.a('string');
      void expect(tabId).to.have.lengthOf(32);

      expect(sessionSpan['attributes']).to.deep.equal([
        { key: 'emb.type', value: { stringValue: 'ux.session' } },
        { key: 'emb.state', value: { stringValue: 'foreground' } },
        {
          key: 'session.id',
          value: { stringValue: sessionID },
        },
        { key: 'emb.cold_start', value: { boolValue: true } },
        sessionNumber,
        { key: 'emb.experience_id', value: { stringValue: experienceId } },
        { key: 'emb.tab_id', value: { stringValue: tabId } },
        { key: 'emb.navigation_source', value: { stringValue: 'direct' } },
        { key: 'emb.session_start_type', value: { stringValue: 'init' } },
        { key: 'emb.session_end_type', value: { stringValue: 'manual' } },
        startupDuration,
      ]);
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

      session.getSpanSessionManager().endSessionSpan();

      const exportedSpans = await getLastSessionExportedSpans(1);

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

      session.getSpanSessionManager().endSessionSpan();

      const exportedSpans = await getLastSessionExportedSpans(1);
      expect(exportedSpans).to.have.lengthOf(1000);
      for (let i = 0; i < exportedSpans.length; i++) {
        expect(exportedSpans[i]['name']).to.equal(`my-span-${i.toString()}`);
      }

      fakeFetchResetHistory();

      session.getSpanSessionManager().startSessionSpan();

      // Limit should be reset for the next session
      for (let i = 0; i < 100; i++) {
        embtrace.startSpan(`my-next-session-span-${i.toString()}`).end();
      }

      session.getSpanSessionManager().endSessionSpan();

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
      session.getSpanSessionManager().endSessionSpan();

      const exportedSpans = await getLastSessionExportedSpans(1);
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
      session.getSpanSessionManager().endSessionSpan();

      const exportedSpans = await getLastSessionExportedSpans(1);
      expect(exportedSpans).to.have.lengthOf(1);

      const exportedAttributes = exportedSpans[0].attributes;
      expect(exportedAttributes).to.have.lengthOf(200);

      expect(exportedAttributes[0].key).to.equal('emb.type');
      expect(exportedAttributes[1].key).to.equal('session.id');
      for (let i = 2; i < exportedAttributes.length; i++) {
        // Newest attributes are dropped when the limit is reached, start counting after
        // the 2 internal attributes added by our API
        const expected = i - 2;
        expect(exportedAttributes[i].key).to.equal(
          `span-attribute-${expected.toString()}`,
        );
        expect(exportedAttributes[i].value).to.deep.equal({
          stringValue: expected.toString(),
        });
      }
    });

    it('should apply limits on the length of span attribute values', async () => {
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

      const attributeValue = [];
      // Capped at 1024 characters per span attribute value
      for (let i = 0; i < 2000; i++) {
        attributeValue.push('a');
      }

      span.setAttribute('large-attribute', attributeValue.join(''));

      span.end();
      session.getSpanSessionManager().endSessionSpan();

      const exportedSpans = await getLastSessionExportedSpans(1);
      expect(exportedSpans).to.have.lengthOf(1);
      expect(exportedSpans[0].attributes[2].key).to.equal('large-attribute');
      expect(exportedSpans[0].attributes[2].value.stringValue).to.have.lengthOf(
        1024,
      );
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
      session.getSpanSessionManager().endSessionSpan();

      const exportedSpans = await getLastSessionExportedSpans(1);
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

    // Not being applied currently, this appears to be a bug in OTel package, the relevant config isn't actually being
    // used:
    // https://github.com/search?q=repo%3Aopen-telemetry%2Fopentelemetry-js+attributePerEventCountLimit&type=code
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
      session.getSpanSessionManager().endSessionSpan();

      const exportedSpans = await getLastSessionExportedSpans(1);
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
            // Document load instrumentation generates a bunch of spans in this test environment
            'document-load',
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

      session.getSpanSessionManager().endSessionSpan();

      if (result) {
        await result.flush();
      }

      const exportedSpans = await getLastSessionExportedSpans(1);
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
            // Document load instrumentation generates a bunch of spans in this test environment
            'document-load',
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

      session.getSpanSessionManager().endSessionSpan();

      if (result) {
        await result.flush();
      }

      const exportedSpans = await getLastSessionExportedSpans(1);
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
            // Document load instrumentation generates a bunch of spans in this test environment
            'document-load',
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

      session.getSpanSessionManager().endSessionSpan();

      if (result) {
        await result.flush();
      }

      const exportedSpans = await getLastSessionExportedSpans(1);
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
      expect(fakeFetchGetUrl()).to.contain(
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
      expect(fakeFetchGetUrl()).to.contain(
        'https://a-abc12.config.emb-api.com/v2/config?appId=abc12&osVersion=1&appVersion=EmbIOAppVersionX.X.X&deviceId=',
      );
    });

    it('should disable the SDK', () => {
      const noOpLogManager = new NoOpLogManager();
      const noOpTraceManager = new NoOpTraceManager();
      const noOpSpanSessionManager = new NoOpSpanSessionManager();
      const noOpUserSessionManager = new NoOpUserManager();

      log.setGlobalLogManager(noOpLogManager);
      embtrace.setGlobalTraceManager(noOpTraceManager);
      session.setGlobalSessionManager(noOpSpanSessionManager);
      user.setGlobalUserManager(noOpUserSessionManager);

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

        // session
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

  describe('console logging', () => {
    let consoleErrorStub: SinonStub;
    let consoleWarnStub: SinonStub;
    let consoleInfoStub: SinonStub;

    beforeEach(() => {
      consoleErrorStub = sinon.stub(console, 'error');
      consoleWarnStub = sinon.stub(console, 'warn');
      consoleInfoStub = sinon.stub(console, 'info');
    });

    afterEach(() => {
      consoleErrorStub.restore();
      consoleWarnStub.restore();
      consoleInfoStub.restore();
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

    beforeEach(() => {
      consoleErrorStub = sinon.stub(console, 'error');
      consoleWarnStub = sinon.stub(console, 'warn');
    });

    afterEach(() => {
      consoleErrorStub.restore();
      consoleWarnStub.restore();
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

          const headers = (fetchStub.lastCall.args[1] as RequestInit).headers;
          if (test.expectInjection) {
            expect(headers).to.have.property('traceparent');
            injectedTraceparentHeader = (headers as Record<string, string>)[
              'traceparent'
            ];
          } else {
            expect(headers).not.to.have.property('traceparent');
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

        session.getSpanSessionManager().endSessionSpan();

        // Need to restore the clock here so that the setTimeout in `getLastSessionExportedSpans` works
        clock.restore();
        const exportedSpans = await getLastSessionExportedSpans(
          test.networkType === 'fetch' ? 1 : 0,
          {
            name:
              test.networkType === 'fetch'
                ? '@opentelemetry/instrumentation-fetch'
                : '@opentelemetry/instrumentation-xml-http-request',
            version: '0.208.0',
          },
        );
        expect(exportedSpans).to.have.lengthOf(1);
        const networkSpan = exportedSpans[0];
        const expectedTraceparent = `00-${networkSpan.traceId}-${networkSpan.spanId}-01`;

        expect(networkSpan.name).to.be.equal(
          test.networkType === 'fetch' ? 'HTTP GET' : 'GET',
        );
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

    session.startSessionSpan();
    session.endSessionSpan();

    await result.flush();

    expect(spanExporter.getFinishedSpans()).to.have.lengthOf(0);
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
        omit: new Set(['document-load']),
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
        omit: new Set(['document-load']),
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

      sdkInstance.log.message('some log', 'info');
      sdkInstance.trace.startSpan('some span').end();
      sdkInstance.session.startSessionSpan();
      sdkInstance.session.endSessionSpan();
      instrumentation.emit();

      await sdkInstance.flush();

      const finishedLogRecords = logExporter.getFinishedLogRecords();

      expect(finishedLogRecords).to.have.lengthOf(2);
      expect(finishedLogRecords[0].body).to.equal('some log');
      expect(finishedLogRecords[1].body).to.equal('my log');

      const finishedSpans = spanExporter.getFinishedSpans();

      expect(finishedSpans).to.have.lengthOf(3);
      expect(finishedSpans[0].name).to.equal('some span');
      expect(finishedSpans[1].name).to.equal('emb-session');
      expect(finishedSpans[2].name).to.equal('my span');
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

    // Need to give time for the remote config to be fetched and then parsed
    await new Promise((r) => setTimeout(r, 1));
    await new Promise((r) => setTimeout(r, 1));

    // First instance using namespaced storage
    expect(!!localStorage.getItem('app11_embrace_user_id')).to.equal(
      true,
      'first app did not store embrace user id',
    );
    expect(!!localStorage.getItem('app11_embrace_remote_config')).to.equal(
      true,
      'first app did not store remote config',
    );
    expect(!!sessionStorage.getItem('app11_embrace_app_instance_id')).to.equal(
      true,
      'first app did not store app instance id',
    );
    expect(!!sessionStorage.getItem('app11_embrace_tab')).to.equal(
      true,
      'first app did not store embrace tab',
    );

    // Second instance using namespaced storage
    expect(!!localStorage.getItem('app22_embrace_user_id')).to.equal(
      true,
      'second app did not store embrace user id',
    );
    expect(!!localStorage.getItem('app22_embrace_remote_config')).to.equal(
      true,
      'second app did not store remote config',
    );
    expect(!!sessionStorage.getItem('app22_embrace_app_instance_id')).to.equal(
      true,
      'second app did not store app instance id',
    );
    expect(!!sessionStorage.getItem('app22_embrace_tab')).to.equal(
      true,
      'second app did not store embrace tab',
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
    expect(!!sessionStorage.getItem('embrace_tab')).to.equal(
      false,
      'found globally stored tab',
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

    // Need to give time for the remote config to be fetched and then parsed
    await new Promise((r) => setTimeout(r, 1));
    await new Promise((r) => setTimeout(r, 1));

    // Second instance using namespaced storage
    expect(!!localStorage.getItem('app22_embrace_user_id')).to.equal(true);
    expect(!!localStorage.getItem('app22_embrace_remote_config')).to.equal(
      true,
    );
    expect(!!sessionStorage.getItem('app22_embrace_app_instance_id')).to.equal(
      true,
    );
    expect(!!sessionStorage.getItem('app22_embrace_tab')).to.equal(true);

    // First instance using storage without a prefix
    expect(!!localStorage.getItem('embrace_user_id')).to.equal(true);
    expect(!!sessionStorage.getItem('embrace_app_instance_id')).to.equal(true);
    expect(!!sessionStorage.getItem('embrace_tab')).to.equal(true);
  });

  it('should not namespace the storage when registering globally', async () => {
    fakeFetchRespondWith(
      JSON.stringify({
        threshold: 90,
      }),
    );

    const firstSDKInstance = initSDK({
      appID: 'app11',
      appVersion: 'app-version',
    });

    const secondSDKInstance = initSDK({
      appID: 'app22',
      appVersion: 'app-version',
      registerGlobally: false,
    });

    void expect(firstSDKInstance).not.to.be.false;
    void expect(secondSDKInstance).not.to.be.false;

    // Need to give time for the remote config to be fetched and then parsed
    await new Promise((r) => setTimeout(r, 1));
    await new Promise((r) => setTimeout(r, 1));

    // Second instance using namespaced storage
    expect(!!localStorage.getItem('app22_embrace_user_id')).to.equal(true);
    expect(!!localStorage.getItem('app22_embrace_remote_config')).to.equal(
      true,
    );
    expect(!!sessionStorage.getItem('app22_embrace_app_instance_id')).to.equal(
      true,
    );
    expect(!!sessionStorage.getItem('app22_embrace_tab')).to.equal(true);

    // First instance using storage without a prefix
    expect(!!localStorage.getItem('embrace_user_id')).to.equal(true);
    expect(!!localStorage.getItem('embrace_remote_config')).to.equal(true);
    expect(!!sessionStorage.getItem('embrace_app_instance_id')).to.equal(true);
    expect(!!sessionStorage.getItem('embrace_tab')).to.equal(true);
  });
});
