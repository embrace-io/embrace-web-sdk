import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { initSDK } from './initSDK.js';
import {
  InMemoryDiagLogger,
  FakeInstrumentation,
  FakeLogRecordProcessor,
  FakeSpanProcessor,
  setupTestWebVitalListeners,
} from '../testUtils/index.js';
import { trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import type { WebVitalOnReport } from '../instrumentations/web-vitals/WebVitalsInstrumentation/types.js';
import type { MetricWithAttribution } from 'web-vitals/attribution';
import sinonChai from 'sinon-chai';
import { session } from '../api-sessions/index.js';

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
});
