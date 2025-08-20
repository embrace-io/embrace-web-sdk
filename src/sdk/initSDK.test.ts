import { diag, DiagLogLevel, trace, context } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { Resource } from '@opentelemetry/resources';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import type { SinonStub } from 'sinon';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { MetricWithAttribution } from 'web-vitals/attribution';
import {
  NoOpSpanSessionManager,
  ProxySpanSessionManager,
  session,
} from '../api-sessions/index.js';
import type { WebVitalOnReport } from '../instrumentations/index.js';
import { SDK_VERSION } from '../resources/index.js';
import {
  fakeFetchGetBody,
  fakeFetchGetRequestHeaders,
  fakeFetchInstall,
  fakeFetchRespondWith,
  fakeFetchRestore,
  FakeInstrumentation,
  FakeLogRecordProcessor,
  FakeSpanProcessor,
  InMemoryDiagLogger,
  setupTestWebVitalListeners,
  fakeFetchResetHistory,
  fakeFetchWasCalled,
  fakeFetchGetUrl,
} from '../testUtils/index.js';
import { initSDK } from './initSDK.js';
import { log, NoOpLogManager, ProxyLogManager } from '../api-logs/index.js';
import {
  NoOpTraceManager,
  ProxyTraceManager,
  trace as embtrace,
} from '../api-traces/index.js';
import {
  EmbraceLogManager,
  EmbraceSpanSessionManager,
  EmbraceTraceManager,
  EmbraceUserManager,
} from '../managers/index.js';
import { NoOpUserManager, ProxyUserManager, user } from '../api-users/index.js';
import { registry } from './registry.js';
import type { DynamicConfigManager } from './types.js';

chai.use(sinonChai);
const { expect } = chai;

type ExportedSpan = ReadableSpan & {
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

const getLastSessionExportedSpans = async (callNumber = 0) => {
  // Needed to allow the transport to actually send its data off to fetch
  await new Promise(r => setTimeout(r, 1));

  const body = fakeFetchGetBody(callNumber);
  void expect(body).not.to.be.null;
  const decompressedStream = new Response(body).body?.pipeThrough(
    new DecompressionStream('gzip')
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
  const tracesScopeSpan = resourceSpan['scopeSpans'][1];
  expect(tracesScopeSpan['scope']).to.deep.equal({
    name: 'embrace-web-sdk-traces',
  });

  return tracesScopeSpan['spans'] as ExportedSpan[];
};

describe('initSDK', () => {
  let spanExporter: InMemorySpanExporter;
  let logExporter: InMemoryLogRecordExporter;

  before(() => {
    spanExporter = new InMemorySpanExporter();
    logExporter = new InMemoryLogRecordExporter();
  });

  afterEach(() => {
    spanExporter.reset();
    logExporter.reset();
    trace.disable();
    logs.disable();
    diag.disable();
    registry.clear();
  });

  it('should require an app ID when not setting custom exporters', () => {
    const diagLogger = new InMemoryDiagLogger();
    // @ts-expect-error need to bypass type checking to test this invalid configuration
    const result = initSDK({ diagLogger });
    void expect(result).to.be.false;

    expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
    expect(diagLogger.getErrorLogs()[0]).to.equal(
      'failed to initialize the SDK: when the embrace appID is omitted then at least one logExporter or spanExporter must be set'
    );
  });

  it('should ensure the app ID is valid', () => {
    const diagLogger = new InMemoryDiagLogger();
    const result = initSDK({ appID: 'foo-app-id', diagLogger });
    void expect(result).to.be.false;

    expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
    expect(diagLogger.getErrorLogs()[0]).to.equal(
      'failed to initialize the SDK: appID should be 5 characters long'
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
    void expect(finishedSpans[0].attributes.fake).to.be.equal('my-attr');

    const finishedLogRecords = logExporter.getFinishedLogRecords();
    expect(finishedLogRecords).to.have.lengthOf(1);
    void expect(finishedLogRecords[0].body).to.be.equal('my log');
    void expect(finishedLogRecords[0].attributes.fake).to.be.equal('my-attr');
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
    void expect(testWebVitalListeners.clsStub.calledOnce).to.be.true;
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
      (log.getLogManager() as ProxyLogManager).getDelegate()
    ).to.be.instanceOf(EmbraceLogManager);

    expect(session.getSpanSessionManager()).to.be.instanceOf(
      ProxySpanSessionManager
    );
    expect(
      (session.getSpanSessionManager() as ProxySpanSessionManager).getDelegate()
    ).to.be.instanceOf(EmbraceSpanSessionManager);

    expect(embtrace.getTraceManager()).to.be.instanceOf(ProxyTraceManager);
    expect(
      (embtrace.getTraceManager() as ProxyTraceManager).getDelegate()
    ).to.be.instanceOf(EmbraceTraceManager);

    expect(user.getUserManager()).to.be.instanceOf(ProxyUserManager);
    expect(
      (user.getUserManager() as ProxyUserManager).getDelegate()
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

  it('should ensure a provided template bundle ID is valid', () => {
    const diagLogger = new InMemoryDiagLogger();
    const result = initSDK({
      appID: 'abc12',
      templateBundleID: 'invalid-bundle-id',
      diagLogger,
    });
    void expect(result).to.be.false;

    expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
    expect(diagLogger.getErrorLogs()[0]).to.equal(
      'failed to initialize the SDK: templateBundleID should be 32 characters long'
    );
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
        })
      ).to.be.true;
    }
  });

  describe('communication with Embrace', () => {
    beforeEach(() => {
      fakeFetchInstall();
    });

    afterEach(() => {
      fakeFetchRestore();
    });

    it('should include the correct resource attributes', async () => {
      fakeFetchRespondWith('');

      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        resource: new Resource({ r1: 'my-resource-attr' }),
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

      const sessionID = session.getSessionId();
      session.endSessionSpan();

      // Needed to allow the transport to actually send its data off to fetch
      await new Promise(r => setTimeout(r, 1));

      const headers = fakeFetchGetRequestHeaders(1);
      expect((headers as Record<string, string>)['X-EM-AID']).to.equal('abc12');

      const body = fakeFetchGetBody(1);

      void expect(body).not.to.be.null;
      const decompressedStream = new Response(body).body?.pipeThrough(
        new DecompressionStream('gzip')
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
          {
            key: 'bundle_id',
            value: { stringValue: 'EmbIOBundleIDfd6996f1007b363f87a' },
          },
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
        attr => attr.key === 'emb.session_number'
      );
      void expect(sessionNumber?.value.intValue).not.to.be.undefined;
      expect(sessionNumber?.value.intValue).to.be.greaterThan(0);
      expect(sessionNumber?.value.intValue).to.be.lessThan(20);

      const startupDuration = sessionSpan['attributes'].find(
        attr => attr.key === 'emb.sdk_startup_duration'
      );
      void expect(startupDuration?.value.intValue).not.to.be.undefined;
      expect(startupDuration?.value.intValue).to.be.greaterThan(0);
      expect(startupDuration?.value.intValue).to.be.lessThan(100);

      expect(sessionSpan['attributes']).to.deep.equal([
        { key: 'emb.type', value: { stringValue: 'ux.session' } },
        { key: 'emb.state', value: { stringValue: 'foreground' } },
        {
          key: 'session.id',
          value: { stringValue: sessionID },
        },
        { key: 'emb.cold_start', value: { boolValue: true } },
        sessionNumber,
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
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

      embtrace.startSpan('my performance span').end();
      // shouldn't get exported
      embtrace.startSpan('my unfinished performance span');

      session.getSpanSessionManager().endSessionSpan();

      const exportedSpans = await getLastSessionExportedSpans(1);

      expect(exportedSpans[0]['name']).to.be.equal('my performance span');
    });

    it('should include a custom template bundle ID in the resource attributes if provided', async () => {
      fakeFetchRespondWith('');
      const result = initSDK({
        appID: 'abc12',
        templateBundleID: 'aaaaBBBBccccDDDDeeeeFFFFggggHHHH',
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

      session.getSpanSessionManager().endSessionSpan();

      // Needed to allow the transport to actually send its data off to fetch
      await new Promise(r => setTimeout(r, 1));

      const headers = fakeFetchGetRequestHeaders();
      expect((headers as Record<string, string>)['X-EM-AID']).to.equal('abc12');

      const body = fakeFetchGetBody();
      void expect(body).not.to.be.null;
      const decompressedStream = new Response(body).body?.pipeThrough(
        new DecompressionStream('gzip')
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
          {
            key: 'bundle_id',
            value: { stringValue: 'aaaaBBBBccccDDDDeeeeFFFFggggHHHH' },
          },
        ],
        droppedAttributesCount: 0,
      });
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
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

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
          `my-next-session-span-${i.toString()}`
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
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

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
          `span-event-${expected.toString()}`
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
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

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
          `span-attribute-${expected.toString()}`
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
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

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
        1024
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
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

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
          `span-event-${expected.toString()}`
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
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

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
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

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
        'https://REDACTED:REDACTED@www.example.com/some/other/path'
      );
      expect(finishedLogRecords[0].attributes['url.query']).to.be.equal(
        'foo=bar&pw=REDACTED&foopw=safe&AWSAccessKeyId=REDACTED'
      );
      expect(finishedLogRecords[0].attributes['safe']).to.be.equal(
        'some other attr'
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
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

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
        'https://username:password@www.example.com/some/other/path'
      );
      expect(finishedLogRecords[0].attributes['url.query']).to.be.equal(
        'foo=bar&pw=my-pass&foopw=safe&AWSAccessKeyId=mykey'
      );
      expect(finishedLogRecords[0].attributes['safe']).to.be.equal(
        'some other attr'
      );
    });

    it('should allow custom attribute scrubbers and query string tokens to be specified', async () => {
      fakeFetchRespondWith('');
      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        logExporters: [logExporter],
        attributeScrubbers: [
          { key: 'safe', scrub: value => value + ' ALTERED' },
        ],
        additionalQueryParamsToScrub: ['foo'],
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      // Needed to allow the browser detector resources to be grabbed
      await new Promise(r => setTimeout(r, 1));

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
        'https://REDACTED:REDACTED@www.example.com/some/other/path'
      );
      expect(finishedLogRecords[0].attributes['url.query']).to.be.equal(
        'foo=REDACTED&pw=REDACTED&foopw=safe&AWSAccessKeyId=REDACTED'
      );
      expect(finishedLogRecords[0].attributes['safe']).to.be.equal(
        'some other attr ALTERED'
      );
    });

    it('should refresh the remote config using Embrace if not dynamic config manager is provided', () => {
      fakeFetchRespondWith(
        JSON.stringify({
          threshold: 90,
        })
      );

      const result = initSDK({
        appID: 'abc12',
        appVersion: 'my-app-version',
        defaultInstrumentationConfig: {
          omit: new Set([
            // This instrumentation does its own patching of Fetch which interferes with our test stub
            '@opentelemetry/instrumentation-fetch',
            // Document load instrumentation generates a bunch of spans in this test environment
            '@opentelemetry/instrumentation-document-load',
          ]),
        },
      });
      void expect(result).not.to.be.false;

      void expect(fakeFetchWasCalled()).to.be.true;
      expect(fakeFetchGetUrl()).to.contain(
        'https://a-abc12.config.emb-api.com/v2/config?appId=abc12&osVersion=1&appVersion=my-app-version&deviceId='
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
          'successfully initialized the SDK'
        )
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
          'SDK has already been successfully initialized, skipping this invocation of initSDK'
        )
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
          'failed to initialize the SDK: appID should be 5 characters long'
        )
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
      void expect(testWebVitalListeners.clsStub.calledOnce).to.be.true;

      void expect(
        consoleWarnStub.calledWith(
          'embrace-sdk',
          'SDK has already been successfully initialized, skipping this invocation of initSDK'
        )
      ).to.be.false;
    });
  });
});
