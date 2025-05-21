import { diag, DiagLogLevel, trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { Resource } from '@opentelemetry/resources';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import type { SinonStub } from 'sinon';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { MetricWithAttribution } from 'web-vitals/attribution';
import { ProxySpanSessionManager, session } from '../api-sessions/index.js';
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
} from '../testUtils/index.js';
import { initSDK } from './initSDK.js';
import { log, ProxyLogManager } from '../api-logs/index.js';
import { ProxyTraceManager, trace as embtrace } from '../api-traces/index.js';
import {
  EmbraceLogManager,
  EmbraceSpanSessionManager,
  EmbraceTraceManager,
  EmbraceUserManager,
} from '../managers/index.js';
import { ProxyUserManager, user } from '../api-users/index.js';
import { registry } from './registry.js';

chai.use(sinonChai);
const { expect } = chai;

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
    void expect(testWebVitalListeners.clsStub).to.have.been.calledOnce;
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
    void expect(testWebVitalListeners.clsStub).not.to.have.been.called;
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

    embtrace.startSpan('my performance span')?.end();
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

  describe('export to Embrace', () => {
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

      const sessionID = session.getSpanSessionManager().getSessionId();
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
            key: 'browser.language',
            value: { stringValue: window.navigator.language },
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
      const sessionSpan = scopeSpan['spans'][0];
      expect(sessionSpan['name']).to.be.equal('emb-session');
      expect(sessionSpan['attributes']).to.deep.equal([
        { key: 'emb.type', value: { stringValue: 'ux.session' } },
        { key: 'emb.state', value: { stringValue: 'foreground' } },
        {
          key: 'session.id',
          value: { stringValue: sessionID },
        },
        { key: 'emb.session_end_type', value: { stringValue: 'manual' } },
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

      embtrace.startSpan('my performance span')?.end();
      // shouldn't get exported
      embtrace.startSpan('my unfinished performance span');

      session.getSpanSessionManager().endSessionSpan();

      // Needed to allow the transport to actually send its data off to fetch
      await new Promise(r => setTimeout(r, 1));

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
      expect(tracesScopeSpan['spans']).to.have.lengthOf(1);
      expect(tracesScopeSpan['spans'][0]['name']).to.be.equal(
        'my performance span'
      );
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
      void expect(consoleInfoStub).to.have.been.calledWith(
        'embrace-sdk',
        'successfully initialized the SDK'
      );
      void expect(consoleInfoStub).to.have.been.calledWith('testing', 'info');
      void expect(consoleWarnStub).to.have.been.calledOnce;
      void expect(consoleErrorStub).to.have.been.calledOnce;
    });

    it('should allow sending warning level logs to the console', () => {
      const result = initSDK({ appID: 'abc12', logLevel: DiagLogLevel.WARN });
      void expect(result).not.to.be.false;
      const diagLogger = diag.createComponentLogger({ namespace: 'testing' });

      diagLogger.info('info');
      diagLogger.warn('warning');
      diagLogger.error('error');

      void expect(consoleInfoStub).not.to.have.been.called;
      void expect(consoleWarnStub).to.have.been.calledOnce;
      void expect(consoleErrorStub).to.have.been.calledOnce;
    });

    it('should default to error level logging', () => {
      const result = initSDK({ appID: 'abc12' });
      void expect(result).not.to.be.false;
      const diagLogger = diag.createComponentLogger({ namespace: 'testing' });

      diagLogger.info('info');
      diagLogger.warn('warning');
      diagLogger.error('error');

      void expect(consoleInfoStub).not.to.have.been.called;
      void expect(consoleWarnStub).not.to.have.been.called;
      void expect(consoleErrorStub).to.have.been.calledOnce;
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
      void expect(testWebVitalListeners.clsStub).not.to.have.been.called;

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
      void expect(testWebVitalListeners.clsStub).not.to.have.been.called;

      void expect(consoleWarnStub).to.have.been.calledWith(
        'embrace-sdk',
        'SDK has already been successfully initialized, skipping this invocation of initSDK'
      );
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
      void expect(testWebVitalListeners.clsStub).not.to.have.been.called;
      void expect(consoleWarnStub).not.to.have.been.calledWith(
        'embrace-sdk',
        'failed to initialize the SDK: appID should be 5 characters long'
      );

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
      void expect(testWebVitalListeners.clsStub).to.have.been.calledOnce;

      void expect(consoleWarnStub).not.to.have.been.calledWith(
        'embrace-sdk',
        'SDK has already been successfully initialized, skipping this invocation of initSDK'
      );
    });
  });
});
