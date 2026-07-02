import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type {
  CLSMetricWithAttribution,
  FCPMetricWithAttribution,
  INPMetricWithAttribution,
  MetricWithAttribution,
} from 'web-vitals/attribution';
import { InMemoryDiagLogger } from '../../../../tests/utils/InMemoryDiagLogger.ts';
import { MockPerformanceManager } from '../../../../tests/utils/MockPerformanceManager.ts';
import { setupTestLogExporter } from '../../../../tests/utils/setupTestLogExporter.ts';
import { setupTestWebVitalListeners } from '../../../../tests/utils/setupTestWebVitalListeners.ts';
import {
  EMB_TYPES,
  KEY_APP_SURFACE_LABEL,
  KEY_BROWSER_URL_FULL,
  KEY_EMB_PAGE_ID,
  KEY_EMB_PAGE_PATH,
  KEY_EMB_TYPE,
} from '../../../constants/attributes.ts';
import { EmbracePageManager } from '../../../managers/EmbracePageManager/EmbracePageManager.ts';
import type { WebVitalListeners, WebVitalOnReport } from './types.ts';
import { WebVitalsInstrumentation } from './WebVitalsInstrumentation.ts';

chai.use(sinonChai);
const { expect } = chai;

const urlDocument = { URL: 'https://example.com' };

describe('WebVitalsInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let instrumentation: WebVitalsInstrumentation;
  let diag: InMemoryDiagLogger;
  let perf: MockPerformanceManager;
  let clock: sinon.SinonFakeTimers;
  let mockWebVitalListeners: WebVitalListeners;
  let clsStub: sinon.SinonStub;
  let fcpStub: sinon.SinonStub;
  let lcpStub: sinon.SinonStub;
  let inpStub: sinon.SinonStub;
  let ttfbStub: sinon.SinonStub;

  before(() => {
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);
    diag = new InMemoryDiagLogger();
    const testWebVitalListeners = setupTestWebVitalListeners();

    mockWebVitalListeners = testWebVitalListeners.listeners;
    clsStub = testWebVitalListeners.clsStub;
    fcpStub = testWebVitalListeners.fcpStub;
    lcpStub = testWebVitalListeners.lcpStub;
    inpStub = testWebVitalListeners.inpStub;
    ttfbStub = testWebVitalListeners.ttfbStub;
  });

  afterEach(() => {
    clock.restore();
    instrumentation.disable();
  });

  it('should report CLS metrics as a log record', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    void expect(clsStub.calledOnce).to.be.true;
    const metricReportFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;

    clock.tick(5000);

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

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.eventName).to.equal('browser.web_vital');
    expect(record.attributes).to.deep.equal({
      [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
      'browser.web_vital.delta': 0,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'cls',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'good',
      'browser.web_vital.value': 22,
    });
    expect(record.hrTime).to.deep.equal([5, 0]);
    expect(record.body).to.equal('{}');
  });

  it('should use largestShiftTime as timestamp for CLS', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;

    metricReportFunc({
      name: 'CLS',
      value: 22,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        largestShiftTime: 3000,
        largestShiftValue: 3.0,
        largestShiftTarget: 'some-target',
        loadState: 'complete',
      },
    } as MetricWithAttribution);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.attributes).to.deep.equal({
      [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
      'browser.web_vital.delta': 0,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'cls',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'good',
      'browser.web_vital.value': 22,
    });
    // largestShiftTime drives the timestamp
    expect(record.hrTime).to.deep.equal([3, 0]);
    // Attribution data is in the body
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['largestShiftTime']).to.equal(3000);
    expect(body['largestShiftValue']).to.equal(3.0);
    expect(body['largestShiftTarget']).to.equal('some-target');
    expect(body['loadState']).to.equal('complete');
  });

  it('should report FCP metrics as a log record', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = fcpStub.getCall(0).args[0] as WebVitalOnReport;

    clock.tick(5000);

    metricReportFunc({
      name: 'FCP',
      value: 33,
      rating: 'needs-improvement',
      delta: 99,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        timeToFirstByte: 20,
        firstByteToFCP: 40,
        loadState: 'complete',
      },
    } as MetricWithAttribution);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.eventName).to.equal('browser.web_vital');
    expect(record.attributes).to.deep.equal({
      [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
      'browser.web_vital.delta': 99,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'fcp',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'needs-improvement',
      'browser.web_vital.value': 33,
    });
    expect(record.hrTime).to.deep.equal([5, 0]);
    // Attribution primitives are in the body
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['timeToFirstByte']).to.equal(20);
    expect(body['firstByteToFCP']).to.equal(40);
    expect(body['loadState']).to.equal('complete');
  });

  it('should report LCP metrics as a log record', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = lcpStub.getCall(0).args[0] as WebVitalOnReport;

    clock.tick(5000);

    metricReportFunc({
      name: 'LCP',
      value: 22,
      rating: 'poor',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        timeToFirstByte: 999,
        resourceLoadDelay: 1000,
        resourceLoadDuration: 2000,
        elementRenderDelay: 3000,
      },
    } as MetricWithAttribution);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.eventName).to.equal('browser.web_vital');
    expect(record.attributes).to.deep.equal({
      [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
      'browser.web_vital.delta': 0,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'lcp',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'poor',
      'browser.web_vital.value': 22,
    });
    expect(record.hrTime).to.deep.equal([5, 0]);
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['timeToFirstByte']).to.equal(999);
    expect(body['resourceLoadDelay']).to.equal(1000);
    expect(body['resourceLoadDuration']).to.equal(2000);
    expect(body['elementRenderDelay']).to.equal(3000);
  });

  it('should report INP metrics as a log record', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = inpStub.getCall(0).args[0] as WebVitalOnReport;

    clock.tick(5000);

    metricReportFunc({
      name: 'INP',
      value: 22,
      rating: 'poor',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        interactionTarget: 'some-target',
        interactionTargetElement: undefined,
        interactionTime: 19000,
        nextPaintTime: 18000,
        interactionType: 'pointer',
        processedEventEntries: [],
        longAnimationFrameEntries: [],
        inputDelay: 1000,
        processingDuration: 2000,
        presentationDelay: 3000,
        loadState: 'complete',
      },
    } as MetricWithAttribution);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.eventName).to.equal('browser.web_vital');
    expect(record.attributes).to.deep.equal({
      [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
      'browser.web_vital.delta': 0,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'inp',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'poor',
      'browser.web_vital.value': 22,
    });
    // Time should be based on interactionTime from attribution
    expect(record.hrTime).to.deep.equal([19, 0]);
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['interactionTarget']).to.equal('some-target');
    expect(body['interactionTime']).to.equal(19000);
    expect(body['nextPaintTime']).to.equal(18000);
    expect(body['interactionType']).to.equal('pointer');
    expect(body['inputDelay']).to.equal(1000);
    expect(body['processingDuration']).to.equal(2000);
    expect(body['presentationDelay']).to.equal(3000);
    expect(body['loadState']).to.equal('complete');
  });

  describe('loaf_scripts attribution', () => {
    let originalPerformanceObserver: typeof globalThis.PerformanceObserver;

    beforeEach(() => {
      originalPerformanceObserver = globalThis.PerformanceObserver;
      (globalThis as Record<string, unknown>)['PerformanceObserver'] = class {
        public static supportedEntryTypes = ['long-animation-frame'];
      };
    });

    afterEach(() => {
      (globalThis as Record<string, unknown>)['PerformanceObserver'] =
        originalPerformanceObserver;
    });

    const fireINP = (
      metricReportFunc: WebVitalOnReport,
      loafEntries: PerformanceLongAnimationFrameTiming[],
    ) => {
      metricReportFunc({
        name: 'INP',
        value: 200,
        rating: 'needs-improvement',
        delta: 200,
        id: 'm2',
        entries: [],
        navigationType: 'navigate',
        attribution: {
          interactionTarget: 'button',
          interactionTargetElement: undefined,
          interactionTime: 1000,
          nextPaintTime: 1200,
          interactionType: 'pointer',
          processedEventEntries: [],
          longAnimationFrameEntries: loafEntries,
          inputDelay: 10,
          processingDuration: 150,
          presentationDelay: 40,
          loadState: 'complete',
        },
      } as INPMetricWithAttribution);
    };

    it('should include loaf_scripts in INP log record', () => {
      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlAttribution: false,
      });

      const metricReportFunc = inpStub.getCall(0).args[0] as WebVitalOnReport;

      fireINP(metricReportFunc, [
        {
          scripts: [
            {
              sourceURL: 'https://example.com/app.js',
              duration: 100,
              forcedStyleAndLayoutDuration: 10,
            },
            {
              sourceURL: '',
              duration: 50,
              forcedStyleAndLayoutDuration: 5,
            },
          ],
        } as PerformanceLongAnimationFrameTiming,
      ]);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      const loafScripts = JSON.parse(
        records[0].attributes[
          'emb.web_vital.attribution.loaf_scripts'
        ] as string,
      ) as Record<string, unknown>;

      expect(loafScripts['https://example.com/app.js']).to.deep.equal({
        total_duration: 100,
        style_and_layout_duration: 10,
        count: 1,
      });
      expect(loafScripts['(inline)']).to.deep.equal({
        total_duration: 50,
        style_and_layout_duration: 5,
        count: 1,
      });
    });

    it('should aggregate scripts across multiple loaf entries', () => {
      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlAttribution: false,
      });

      const metricReportFunc = inpStub.getCall(0).args[0] as WebVitalOnReport;

      fireINP(metricReportFunc, [
        {
          scripts: [
            {
              sourceURL: 'https://example.com/app.js',
              duration: 60,
              forcedStyleAndLayoutDuration: 10,
            },
          ],
        } as PerformanceLongAnimationFrameTiming,
        {
          scripts: [
            {
              sourceURL: 'https://example.com/app.js',
              duration: 40,
              forcedStyleAndLayoutDuration: 20,
            },
          ],
        } as PerformanceLongAnimationFrameTiming,
      ]);

      const records = memoryExporter.getFinishedLogRecords();
      const loafScripts = JSON.parse(
        records[0].attributes[
          'emb.web_vital.attribution.loaf_scripts'
        ] as string,
      ) as Record<string, unknown>;

      expect(loafScripts['https://example.com/app.js']).to.deep.equal({
        total_duration: 100,
        style_and_layout_duration: 30,
        count: 2,
      });
    });

    it('should not include loaf_scripts when no LoAF entries are reported', () => {
      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlAttribution: false,
      });

      const metricReportFunc = inpStub.getCall(0).args[0] as WebVitalOnReport;

      fireINP(metricReportFunc, []);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records[0].attributes['emb.web_vital.attribution.loaf_scripts']).to
        .be.undefined;
    });
  });

  it('should report TTFB metrics with sub-part attributes', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;

    clock.tick(5000);

    metricReportFunc({
      name: 'TTFB',
      value: 33,
      rating: 'poor',
      delta: 99,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        waitingDuration: 20,
        cacheDuration: 40,
        dnsDuration: 60,
        connectionDuration: 80,
        requestDuration: 100,
        navigationEntry: {
          redirectStart: 0,
          redirectEnd: 0,
          domainLookupStart: 10,
          domainLookupEnd: 20,
          connectStart: 20,
          connectEnd: 30,
          secureConnectionStart: 0,
          requestStart: 30,
          responseStart: 50,
          responseEnd: 60,
          startTime: 0,
        } as PerformanceNavigationTiming,
      },
    } as MetricWithAttribution);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.eventName).to.equal('browser.web_vital');
    expect(record.attributes).to.deep.equal({
      [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
      'browser.web_vital.delta': 99,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'ttfb',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'poor',
      'browser.web_vital.value': 33,
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 10,
      'emb.web_vital.attribution.tcpConnection': 10,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 20,
      'emb.web_vital.attribution.unattributed': 20,
    });
    expect(record.hrTime).to.deep.equal([5, 0]);
    const ttfbBody = JSON.parse(record.body as string) as Record<
      string,
      unknown
    >;
    expect(ttfbBody['waitingDuration']).to.equal(20);
    expect(ttfbBody['cacheDuration']).to.equal(40);
    expect(ttfbBody['dnsDuration']).to.equal(60);
    expect(ttfbBody['connectionDuration']).to.equal(80);
    expect(ttfbBody['requestDuration']).to.equal(100);
  });

  it('should omit TTFB sub-parts when navigationEntry is absent', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlDocument,
    });

    const pageTrackFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;
    const emitFunc = ttfbStub.getCall(1).args[0] as WebVitalOnReport;

    const metric = {
      name: 'TTFB',
      value: 33,
      rating: 'good',
      delta: 33,
      id: 'm2',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        waitingDuration: 20,
        cacheDuration: 0,
        dnsDuration: 0,
        connectionDuration: 0,
        requestDuration: 33,
      },
    } as MetricWithAttribution;

    pageTrackFunc(metric);
    emitFunc(metric);

    const records = memoryExporter.getFinishedLogRecords();
    const record = records[0];

    expect(record.attributes).to.deep.include({
      'browser.web_vital.delta': 33,
      'browser.web_vital.id': 'm2',
      'browser.web_vital.name': 'ttfb',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'good',
      'browser.web_vital.value': 33,
      [KEY_BROWSER_URL_FULL]: 'https://example.com',
    });
    expect(record.attributes).to.not.have.any.keys([
      'emb.web_vital.attribution.redirect',
      'emb.web_vital.attribution.domainLookup',
      'emb.web_vital.attribution.tcpConnection',
      'emb.web_vital.attribution.tlsNegotiation',
      'emb.web_vital.attribution.serverResponse',
      'emb.web_vital.attribution.unattributed',
    ]);
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['waitingDuration']).to.equal(20);
    expect(body['cacheDuration']).to.equal(0);
    expect(body['dnsDuration']).to.equal(0);
    expect(body['connectionDuration']).to.equal(0);
    expect(body['requestDuration']).to.equal(33);
  });

  it('should compute TTFB sub-parts correctly with TLS', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;

    metricReportFunc({
      name: 'TTFB',
      value: 80,
      rating: 'good',
      delta: 80,
      id: 'm3',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        waitingDuration: 0,
        cacheDuration: 0,
        dnsDuration: 10,
        connectionDuration: 20,
        requestDuration: 30,
        navigationEntry: {
          redirectStart: 0,
          redirectEnd: 0,
          domainLookupStart: 10,
          domainLookupEnd: 20,
          connectStart: 20,
          connectEnd: 50,
          secureConnectionStart: 40,
          requestStart: 50,
          responseStart: 70,
          responseEnd: 90,
          startTime: 0,
        } as PerformanceNavigationTiming,
      },
    } as MetricWithAttribution);

    const record = memoryExporter.getFinishedLogRecords()[0];

    // TLS: tcpConnection = secureConnectionStart - connectStart = 40 - 20 = 20
    //      tlsNegotiation = connectEnd - secureConnectionStart = 50 - 40 = 10
    // serverResponse = responseStart - requestStart = 70 - 50 = 20
    // other = 90 - 0 - 0 - 10 - 20 - 10 - 20 = 30
    expect(record.attributes).to.deep.include({
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 10,
      'emb.web_vital.attribution.tcpConnection': 20,
      'emb.web_vital.attribution.tlsNegotiation': 10,
      'emb.web_vital.attribution.serverResponse': 20,
      'emb.web_vital.attribution.unattributed': 30,
    });
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['waitingDuration']).to.equal(0);
    expect(body['cacheDuration']).to.equal(0);
    expect(body['dnsDuration']).to.equal(10);
    expect(body['connectionDuration']).to.equal(20);
    expect(body['requestDuration']).to.equal(30);
  });

  it('should use finalResponseHeadersStart for serverResponse when greater than responseStart', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;

    metricReportFunc({
      name: 'TTFB',
      value: 80,
      rating: 'good',
      delta: 80,
      id: 'm4',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        waitingDuration: 0,
        cacheDuration: 0,
        dnsDuration: 0,
        connectionDuration: 0,
        requestDuration: 50,
        navigationEntry: {
          redirectStart: 0,
          redirectEnd: 0,
          domainLookupStart: 0,
          domainLookupEnd: 0,
          connectStart: 0,
          connectEnd: 0,
          secureConnectionStart: 0,
          requestStart: 10,
          responseStart: 50,
          finalResponseHeadersStart: 70,
          responseEnd: 80,
          startTime: 0,
        } as PerformanceNavigationTiming & {
          finalResponseHeadersStart?: number;
        },
      },
    } as MetricWithAttribution);

    const record = memoryExporter.getFinishedLogRecords()[0];

    // finalResponseHeadersStart (70) > responseStart (50), so serverResponse = 70 - 10 = 60
    // other = max(0, 80 - 0 - 0 - 0 - 0 - 0 - 60) = 20
    expect(record.attributes).to.deep.include({
      'emb.web_vital.attribution.serverResponse': 60,
      'emb.web_vital.attribution.unattributed': 20,
    });
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['waitingDuration']).to.equal(0);
    expect(body['cacheDuration']).to.equal(0);
    expect(body['dnsDuration']).to.equal(0);
    expect(body['connectionDuration']).to.equal(0);
    expect(body['requestDuration']).to.equal(50);
  });

  it('should fall back to responseStart when finalResponseHeadersStart is less than responseStart', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;

    metricReportFunc({
      name: 'TTFB',
      value: 80,
      rating: 'good',
      delta: 80,
      id: 'm4',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        waitingDuration: 0,
        cacheDuration: 0,
        dnsDuration: 0,
        connectionDuration: 0,
        requestDuration: 40,
        navigationEntry: {
          redirectStart: 0,
          redirectEnd: 0,
          domainLookupStart: 0,
          domainLookupEnd: 0,
          connectStart: 0,
          connectEnd: 0,
          secureConnectionStart: 0,
          requestStart: 10,
          responseStart: 50,
          finalResponseHeadersStart: 30,
          responseEnd: 80,
          startTime: 0,
        } as PerformanceNavigationTiming & {
          finalResponseHeadersStart?: number;
        },
      },
    } as MetricWithAttribution);

    const record = memoryExporter.getFinishedLogRecords()[0];

    // finalResponseHeadersStart (30) < responseStart (50), falls back to responseStart
    // serverResponse = responseStart - requestStart = 50 - 10 = 40
    expect(record.attributes).to.deep.include({
      'emb.web_vital.attribution.serverResponse': 40,
      'emb.web_vital.attribution.unattributed': 40,
    });
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['waitingDuration']).to.equal(0);
    expect(body['cacheDuration']).to.equal(0);
    expect(body['dnsDuration']).to.equal(0);
    expect(body['connectionDuration']).to.equal(0);
    expect(body['requestDuration']).to.equal(40);
  });

  it('should compute TTFB sub-parts correctly with non-zero redirect', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;

    metricReportFunc({
      name: 'TTFB',
      value: 100,
      rating: 'needs-improvement',
      delta: 100,
      id: 'm5',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        waitingDuration: 0,
        cacheDuration: 0,
        dnsDuration: 10,
        connectionDuration: 10,
        requestDuration: 30,
        navigationEntry: {
          redirectStart: 5,
          redirectEnd: 25,
          domainLookupStart: 25,
          domainLookupEnd: 35,
          connectStart: 35,
          connectEnd: 45,
          secureConnectionStart: 0,
          requestStart: 45,
          responseStart: 75,
          responseEnd: 100,
          startTime: 0,
        } as PerformanceNavigationTiming,
      },
    } as MetricWithAttribution);

    const record = memoryExporter.getFinishedLogRecords()[0];

    // redirect: 25 - 5 = 20, dns: 10, tcp: 10 (no TLS), server: 30, other: 30
    expect(record.attributes).to.deep.include({
      'emb.web_vital.attribution.redirect': 20,
      'emb.web_vital.attribution.domainLookup': 10,
      'emb.web_vital.attribution.tcpConnection': 10,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 30,
      'emb.web_vital.attribution.unattributed': 30,
    });
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['waitingDuration']).to.equal(0);
    expect(body['cacheDuration']).to.equal(0);
    expect(body['dnsDuration']).to.equal(10);
    expect(body['connectionDuration']).to.equal(10);
    expect(body['requestDuration']).to.equal(30);
  });

  it('should round fractional TTFB sub-part values to nearest millisecond', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;

    metricReportFunc({
      name: 'TTFB',
      value: 12,
      rating: 'good',
      delta: 12,
      id: 'm6',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        waitingDuration: 0,
        cacheDuration: 0,
        dnsDuration: 0,
        connectionDuration: 1,
        requestDuration: 1,
        navigationEntry: {
          redirectStart: 0,
          redirectEnd: 0,
          domainLookupStart: 5.2,
          domainLookupEnd: 5.6,
          connectStart: 5.6,
          connectEnd: 6.1,
          secureConnectionStart: 0,
          requestStart: 6.1,
          responseStart: 6.8,
          responseEnd: 7.3,
          startTime: 5.123,
        } as PerformanceNavigationTiming,
      },
    } as MetricWithAttribution);

    const record = memoryExporter.getFinishedLogRecords()[0];

    // total: round(7.3 - 5.123) = round(2.177) = 2
    // dns: round(5.6 - 5.2) = round(0.4) = 0
    // tcp: round(6.1 - 5.6) = round(0.5) = 1
    // server: round(6.8 - 6.1) = round(0.7) = 1
    // unattributed: 2 - 0 - 0 - 1 - 0 - 1 = 0
    expect(record.attributes).to.deep.include({
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 0,
      'emb.web_vital.attribution.tcpConnection': 1,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 1,
      'emb.web_vital.attribution.unattributed': 0,
    });
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['waitingDuration']).to.equal(0);
    expect(body['cacheDuration']).to.equal(0);
    expect(body['dnsDuration']).to.equal(0);
    expect(body['connectionDuration']).to.equal(1);
    expect(body['requestDuration']).to.equal(1);
  });

  it('should clamp negative TTFB sub-part durations to 0', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;

    metricReportFunc({
      name: 'TTFB',
      value: 50,
      rating: 'good',
      delta: 50,
      id: 'm8',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        waitingDuration: 0,
        cacheDuration: 0,
        dnsDuration: 0,
        connectionDuration: 0,
        requestDuration: 0,
        navigationEntry: {
          redirectStart: 10,
          redirectEnd: 5,
          domainLookupStart: 20,
          domainLookupEnd: 15,
          connectStart: 30,
          connectEnd: 25,
          secureConnectionStart: 0,
          requestStart: 40,
          responseStart: 35,
          responseEnd: 50,
          startTime: 0,
        } as PerformanceNavigationTiming,
      },
    } as MetricWithAttribution);

    const record = memoryExporter.getFinishedLogRecords()[0];

    expect(record.attributes).to.deep.include({
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 0,
      'emb.web_vital.attribution.tcpConnection': 0,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 0,
      'emb.web_vital.attribution.unattributed': 50,
    });
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['waitingDuration']).to.equal(0);
    expect(body['cacheDuration']).to.equal(0);
    expect(body['dnsDuration']).to.equal(0);
    expect(body['connectionDuration']).to.equal(0);
    expect(body['requestDuration']).to.equal(0);
  });

  it('should round fractional negative TTFB sub-part durations to 0', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;

    metricReportFunc({
      name: 'TTFB',
      value: 50,
      rating: 'good',
      delta: 50,
      id: 'm8b',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        waitingDuration: 0,
        cacheDuration: 0,
        dnsDuration: 0,
        connectionDuration: 0,
        requestDuration: 0,
        navigationEntry: {
          redirectStart: 10,
          redirectEnd: 9.7,
          domainLookupStart: 20,
          domainLookupEnd: 19.4,
          connectStart: 30,
          connectEnd: 29.8,
          secureConnectionStart: 0,
          requestStart: 40,
          responseStart: 39.3,
          responseEnd: 50,
          startTime: 0,
        } as PerformanceNavigationTiming,
      },
    } as MetricWithAttribution);

    const record = memoryExporter.getFinishedLogRecords()[0];

    expect(record.attributes).to.deep.include({
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 0,
      'emb.web_vital.attribution.tcpConnection': 0,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 0,
      'emb.web_vital.attribution.unattributed': 50,
    });
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['waitingDuration']).to.equal(0);
    expect(body['cacheDuration']).to.equal(0);
    expect(body['dnsDuration']).to.equal(0);
    expect(body['connectionDuration']).to.equal(0);
    expect(body['requestDuration']).to.equal(0);
  });

  it('should ensure TTFB sub-parts sum to rounded total', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;

    metricReportFunc({
      name: 'TTFB',
      value: 10,
      rating: 'good',
      delta: 10,
      id: 'm-sum',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        waitingDuration: 0,
        cacheDuration: 0,
        dnsDuration: 0,
        connectionDuration: 0,
        requestDuration: 0,
        navigationEntry: {
          redirectStart: 0,
          redirectEnd: 0,
          domainLookupStart: 1.1,
          domainLookupEnd: 1.6,
          connectStart: 1.6,
          connectEnd: 3.8,
          secureConnectionStart: 2.1,
          requestStart: 3.8,
          responseStart: 6.3,
          responseEnd: 8.7,
          startTime: 0.2,
        } as PerformanceNavigationTiming,
      },
    } as MetricWithAttribution);

    const attrs = memoryExporter.getFinishedLogRecords()[0]
      .attributes as Record<string, number>;
    const redirect = attrs['emb.web_vital.attribution.redirect'];
    const domainLookup = attrs['emb.web_vital.attribution.domainLookup'];
    const tcpConnection = attrs['emb.web_vital.attribution.tcpConnection'];
    const tlsNegotiation = attrs['emb.web_vital.attribution.tlsNegotiation'];
    const serverResponse = attrs['emb.web_vital.attribution.serverResponse'];
    const unattributed = attrs['emb.web_vital.attribution.unattributed'];

    // total: round(8.7 - 0.2) = round(8.5) = 9
    // dns: 1, tcp: 1, tls: 2, server: 3, unattributed: 2
    expect(redirect).to.equal(0);
    expect(domainLookup).to.equal(1);
    expect(tcpConnection).to.equal(1);
    expect(tlsNegotiation).to.equal(2);
    expect(serverResponse).to.equal(3);
    expect(unattributed).to.equal(2);

    const sum =
      redirect +
      domainLookup +
      tcpConnection +
      tlsNegotiation +
      serverResponse +
      unattributed;
    expect(sum).to.equal(Math.round(8.7 - 0.2));

    const body = JSON.parse(
      memoryExporter.getFinishedLogRecords()[0].body as string,
    ) as Record<string, unknown>;
    expect(body['waitingDuration']).to.equal(0);
    expect(body['cacheDuration']).to.equal(0);
    expect(body['dnsDuration']).to.equal(0);
    expect(body['connectionDuration']).to.equal(0);
    expect(body['requestDuration']).to.equal(0);
  });

  it('should compute TTFB other correctly with non-zero startTime', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;

    metricReportFunc({
      name: 'TTFB',
      value: 80,
      rating: 'good',
      delta: 80,
      id: 'm7',
      entries: [],
      navigationType: 'back-forward',
      attribution: {
        waitingDuration: 0,
        cacheDuration: 0,
        dnsDuration: 10,
        connectionDuration: 10,
        requestDuration: 20,
        navigationEntry: {
          redirectStart: 0,
          redirectEnd: 0,
          domainLookupStart: 20,
          domainLookupEnd: 30,
          connectStart: 30,
          connectEnd: 40,
          secureConnectionStart: 0,
          requestStart: 40,
          responseStart: 60,
          responseEnd: 80,
          startTime: 10,
        } as PerformanceNavigationTiming,
      },
    } as MetricWithAttribution);

    const record = memoryExporter.getFinishedLogRecords()[0];

    // dns: 10, tcp: 10, server: 20, other: 80 - 10 - 0 - 10 - 10 - 0 - 20 = 30
    expect(record.attributes).to.deep.include({
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 10,
      'emb.web_vital.attribution.tcpConnection': 10,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 20,
      'emb.web_vital.attribution.unattributed': 30,
    });
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['waitingDuration']).to.equal(0);
    expect(body['cacheDuration']).to.equal(0);
    expect(body['dnsDuration']).to.equal(10);
    expect(body['connectionDuration']).to.equal(10);
    expect(body['requestDuration']).to.equal(20);
  });

  it('should report multiple metrics as separate log records', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const clsReportFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
    const lcpReportFunc = lcpStub.getCall(0).args[0] as WebVitalOnReport;

    clock.tick(5000);

    clsReportFunc({
      name: 'CLS',
      value: 22,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {},
    } as MetricWithAttribution);

    lcpReportFunc({
      name: 'LCP',
      value: 22,
      rating: 'poor',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        timeToFirstByte: 0,
        resourceLoadDelay: 0,
        resourceLoadDuration: 0,
        elementRenderDelay: 0,
      },
    } as MetricWithAttribution);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(2);

    const clsRecord = records.find(
      (r) => r.attributes['browser.web_vital.name'] === 'cls',
    );
    const lcpRecord = records.find(
      (r) => r.attributes['browser.web_vital.name'] === 'lcp',
    );

    expect(clsRecord?.eventName).to.equal('browser.web_vital');
    expect(lcpRecord?.eventName).to.equal('browser.web_vital');
    expect(clsRecord?.hrTime).to.deep.equal([5, 0]);
    expect(lcpRecord?.hrTime).to.deep.equal([5, 0]);
  });

  it('should not register duplicate callbacks when enable() is called multiple times', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    // Call enable() multiple times
    instrumentation.enable();
    instrumentation.enable();

    expect(clsStub.callCount).to.equal(1);
  });

  it('should log debug message when enable() is called on already registered listeners', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    instrumentation.disable();
    instrumentation.enable();

    expect(diag.getDebugLogs()).to.include(
      'WebVitalsInstrumentation listeners already registered, resuming emission',
    );
  });

  it('should pause emission when disable() is called', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;

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

    instrumentation.disable();

    metricReportFunc({
      name: 'CLS',
      value: 33,
      rating: 'poor',
      delta: 11,
      id: 'm2',
      entries: [],
      navigationType: 'navigate',
      attribution: {},
    } as MetricWithAttribution);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    expect(records[0].attributes['browser.web_vital.id']).to.equal('m1');
  });

  it('should resume emission when enable() is called after disable()', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;

    instrumentation.disable();
    instrumentation.enable();

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

    expect(memoryExporter.getFinishedLogRecords()).to.have.lengthOf(1);
  });

  it('should log debug message when disable() is called', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    instrumentation.disable();

    expect(diag.getDebugLogs()).to.include(
      'WebVitalsInstrumentation disabled, pausing emission',
    );
  });

  it('should report CLS metrics with url attribution', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlDocument,
    });

    void expect(clsStub.calledTwice).to.be.true;
    const pageTrackFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
    const emitFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

    clock.tick(5000);

    const metric = {
      name: 'CLS',
      value: 22,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {},
    } as MetricWithAttribution;

    pageTrackFunc(metric);
    emitFunc(metric);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.eventName).to.equal('browser.web_vital');
    expect(record.attributes).to.deep.include({
      'browser.web_vital.delta': 0,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'cls',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'good',
      'browser.web_vital.value': 22,
      [KEY_BROWSER_URL_FULL]: 'https://example.com',
    });
    expect(record.hrTime).to.deep.equal([5, 0]);
    expect(record.body).to.equal('{}');
  });

  it('should report CLS metrics with largest shift time, loadState and url attribution', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlDocument,
    });

    const pageTrackFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
    const emitFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

    const metric = {
      name: 'CLS',
      value: 22,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        largestShiftTime: 3000,
        largestShiftValue: 3.0,
        largestShiftTarget: 'some-target',
        loadState: 'complete',
      },
    } as MetricWithAttribution;

    pageTrackFunc(metric);
    emitFunc(metric);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.attributes).to.deep.include({
      'browser.web_vital.delta': 0,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'cls',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'good',
      'browser.web_vital.value': 22,
      [KEY_BROWSER_URL_FULL]: 'https://example.com',
    });
    expect(record.hrTime).to.deep.equal([3, 0]);
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['largestShiftTime']).to.equal(3000);
    expect(body['largestShiftValue']).to.equal(3.0);
    expect(body['largestShiftTarget']).to.equal('some-target');
    expect(body['loadState']).to.equal('complete');
  });

  it('should report FCP metrics with url attribution', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlDocument,
    });

    void expect(fcpStub.calledTwice).to.be.true;
    const pageTrackFunc = fcpStub.getCall(0).args[0] as WebVitalOnReport;
    const emitFunc = fcpStub.getCall(1).args[0] as WebVitalOnReport;

    clock.tick(5000);

    const metric = {
      name: 'FCP',
      value: 33,
      rating: 'needs-improvement',
      delta: 99,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        timeToFirstByte: 20,
        firstByteToFCP: 40,
        loadState: 'complete',
      },
    } as MetricWithAttribution;

    pageTrackFunc(metric);
    emitFunc(metric);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.eventName).to.equal('browser.web_vital');
    expect(record.attributes).to.deep.include({
      'browser.web_vital.delta': 99,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'fcp',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'needs-improvement',
      'browser.web_vital.value': 33,
      [KEY_BROWSER_URL_FULL]: 'https://example.com',
    });
    expect(record.hrTime).to.deep.equal([5, 0]);
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['timeToFirstByte']).to.equal(20);
    expect(body['firstByteToFCP']).to.equal(40);
    expect(body['loadState']).to.equal('complete');
  });

  it('should report LCP metrics with url attribution', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlDocument,
    });

    void expect(lcpStub.calledTwice).to.be.true;
    const pageTrackFunc = lcpStub.getCall(0).args[0] as WebVitalOnReport;
    const emitFunc = lcpStub.getCall(1).args[0] as WebVitalOnReport;

    clock.tick(5000);

    const metric = {
      name: 'LCP',
      value: 22,
      rating: 'poor',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        timeToFirstByte: 999,
        resourceLoadDelay: 1000,
        resourceLoadDuration: 2000,
        elementRenderDelay: 3000,
      },
    } as MetricWithAttribution;

    pageTrackFunc(metric);
    emitFunc(metric);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.eventName).to.equal('browser.web_vital');
    expect(record.attributes).to.deep.include({
      'browser.web_vital.delta': 0,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'lcp',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'poor',
      'browser.web_vital.value': 22,
      [KEY_BROWSER_URL_FULL]: 'https://example.com',
    });
    expect(record.hrTime).to.deep.equal([5, 0]);
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['timeToFirstByte']).to.equal(999);
    expect(body['resourceLoadDelay']).to.equal(1000);
    expect(body['resourceLoadDuration']).to.equal(2000);
    expect(body['elementRenderDelay']).to.equal(3000);
  });

  it('should report INP metrics with url attribution', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlDocument,
    });

    void expect(inpStub.calledTwice).to.be.true;
    const pageTrackFunc = inpStub.getCall(0).args[0] as WebVitalOnReport;
    const emitFunc = inpStub.getCall(1).args[0] as WebVitalOnReport;

    clock.tick(5000);

    const metric = {
      name: 'INP',
      value: 22,
      rating: 'poor',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        interactionTarget: 'some-target',
        interactionTargetElement: undefined,
        interactionTime: 19000,
        nextPaintTime: 18000,
        interactionType: 'pointer',
        processedEventEntries: [],
        longAnimationFrameEntries: [],
        inputDelay: 1000,
        processingDuration: 2000,
        presentationDelay: 3000,
        loadState: 'complete',
      },
    } as MetricWithAttribution;

    pageTrackFunc(metric);
    emitFunc(metric);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.eventName).to.equal('browser.web_vital');
    expect(record.attributes).to.deep.include({
      'browser.web_vital.delta': 0,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'inp',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'poor',
      'browser.web_vital.value': 22,
      [KEY_BROWSER_URL_FULL]: 'https://example.com',
    });
    expect(record.hrTime).to.deep.equal([19, 0]);
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['interactionTarget']).to.equal('some-target');
    expect(body['interactionTime']).to.equal(19000);
    expect(body['nextPaintTime']).to.equal(18000);
    expect(body['interactionType']).to.equal('pointer');
    expect(body['inputDelay']).to.equal(1000);
    expect(body['processingDuration']).to.equal(2000);
    expect(body['presentationDelay']).to.equal(3000);
    expect(body['loadState']).to.equal('complete');
  });

  it('should report TTFB metrics with url attribution and raw attribution in body', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlDocument,
    });

    void expect(ttfbStub.calledTwice).to.be.true;
    const pageTrackFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;
    const emitFunc = ttfbStub.getCall(1).args[0] as WebVitalOnReport;

    clock.tick(5000);

    const metric = {
      name: 'TTFB',
      value: 33,
      rating: 'poor',
      delta: 99,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        waitingDuration: 20,
        cacheDuration: 40,
        dnsDuration: 60,
        connectionDuration: 80,
        requestDuration: 100,
        navigationEntry: {
          redirectStart: 0,
          redirectEnd: 0,
          domainLookupStart: 10,
          domainLookupEnd: 20,
          connectStart: 20,
          connectEnd: 30,
          secureConnectionStart: 0,
          requestStart: 30,
          responseStart: 50,
          responseEnd: 60,
          startTime: 0,
        } as PerformanceNavigationTiming,
      },
    } as MetricWithAttribution;

    pageTrackFunc(metric);
    emitFunc(metric);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    const record = records[0];

    expect(record.eventName).to.equal('browser.web_vital');
    expect(record.attributes).to.deep.include({
      'browser.web_vital.delta': 99,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'ttfb',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'poor',
      'browser.web_vital.value': 33,
      [KEY_BROWSER_URL_FULL]: 'https://example.com',
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 10,
      'emb.web_vital.attribution.tcpConnection': 10,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 20,
      'emb.web_vital.attribution.unattributed': 20,
    });
    expect(record.hrTime).to.deep.equal([5, 0]);
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['waitingDuration']).to.equal(20);
    expect(body['cacheDuration']).to.equal(40);
    expect(body['dnsDuration']).to.equal(60);
    expect(body['connectionDuration']).to.equal(80);
    expect(body['requestDuration']).to.equal(100);
  });

  it('should report multiple metrics with url attribution', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlDocument,
    });

    const clsPageTrack = clsStub.getCall(0).args[0] as WebVitalOnReport;
    const clsEmit = clsStub.getCall(1).args[0] as WebVitalOnReport;
    const lcpPageTrack = lcpStub.getCall(0).args[0] as WebVitalOnReport;
    const lcpEmit = lcpStub.getCall(1).args[0] as WebVitalOnReport;

    clock.tick(5000);

    const clsMetric = {
      name: 'CLS',
      value: 22,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {},
    } as MetricWithAttribution;

    const lcpMetric = {
      name: 'LCP',
      value: 22,
      rating: 'poor',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        timeToFirstByte: 999,
        resourceLoadDelay: 1000,
        resourceLoadDuration: 2000,
        elementRenderDelay: 3000,
      },
    } as MetricWithAttribution;

    clsPageTrack(clsMetric);
    clsEmit(clsMetric);
    lcpPageTrack(lcpMetric);
    lcpEmit(lcpMetric);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(2);

    const clsRecord = records.find(
      (r) => r.attributes['browser.web_vital.name'] === 'cls',
    );
    const lcpRecord = records.find(
      (r) => r.attributes['browser.web_vital.name'] === 'lcp',
    );

    expect(clsRecord?.eventName).to.equal('browser.web_vital');
    expect(lcpRecord?.eventName).to.equal('browser.web_vital');
    expect(clsRecord?.attributes).to.deep.include({
      [KEY_BROWSER_URL_FULL]: 'https://example.com',
    });
    expect(lcpRecord?.attributes).to.deep.include({
      [KEY_BROWSER_URL_FULL]: 'https://example.com',
    });
    const lcpBody = JSON.parse(lcpRecord?.body as string) as Record<
      string,
      unknown
    >;
    expect(lcpBody['timeToFirstByte']).to.equal(999);
    expect(lcpBody['resourceLoadDelay']).to.equal(1000);
    expect(lcpBody['resourceLoadDuration']).to.equal(2000);
    expect(lcpBody['elementRenderDelay']).to.equal(3000);
  });

  it('should omit non-serializable attribution values from body', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = inpStub.getCall(0).args[0] as WebVitalOnReport;

    clock.tick(5000);

    metricReportFunc({
      name: 'INP',
      value: 100,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        interactionTarget: 'some-target',
        interactionTime: 19000,
        loadState: 'complete',
        interactionTargetElement: document.createElement('div'),
        processedEventEntries: [{ name: 'click' }],
        longAnimationFrameEntries: [],
      },
    } as unknown as MetricWithAttribution);

    const records = memoryExporter.getFinishedLogRecords();
    const record = records[0];

    expect(record.attributes).to.deep.equal({
      [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
      'browser.web_vital.delta': 0,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'inp',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'good',
      'browser.web_vital.value': 100,
    });
    const body = JSON.parse(record.body as string) as Record<string, unknown>;
    expect(body['interactionTarget']).to.equal('some-target');
    expect(body['interactionTime']).to.equal(19000);
    expect(body['loadState']).to.equal('complete');
  });

  it('should preserve falsy primitive attribution values in body', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;

    clock.tick(5000);

    metricReportFunc({
      name: 'CLS',
      value: 0,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        largestShiftValue: 0,
        loadState: '',
      },
    } as unknown as MetricWithAttribution);

    const records = memoryExporter.getFinishedLogRecords();
    const body = JSON.parse(records[0].body as string) as Record<
      string,
      unknown
    >;
    expect(body['largestShiftValue']).to.equal(0);
    expect(body['loadState']).to.equal('');
  });

  it('should handle null attribution gracefully', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = fcpStub.getCall(0).args[0] as WebVitalOnReport;

    clock.tick(5000);

    metricReportFunc({
      name: 'FCP',
      value: 0,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: null,
    } as unknown as MetricWithAttribution);

    const records = memoryExporter.getFinishedLogRecords();
    const record = records[0];

    expect(record.attributes).to.deep.equal({
      [KEY_EMB_TYPE]: EMB_TYPES.WebVital,
      'browser.web_vital.delta': 0,
      'browser.web_vital.id': 'm1',
      'browser.web_vital.name': 'fcp',
      'browser.web_vital.navigation_type': 'navigate',
      'browser.web_vital.rating': 'good',
      'browser.web_vital.value': 0,
    });
    expect(record.body).to.be.undefined;
  });

  it('should include boolean attribution values in body', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    const metricReportFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;

    clock.tick(5000);

    metricReportFunc({
      name: 'CLS',
      value: 0,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        largestShiftValue: 0,
        hadRecentInput: false,
      },
    } as unknown as MetricWithAttribution);

    const records = memoryExporter.getFinishedLogRecords();
    const body = JSON.parse(records[0].body as string) as Record<
      string,
      unknown
    >;
    expect(body['largestShiftValue']).to.equal(0);
    expect(body['hadRecentInput']).to.equal(false);
  });

  it('should omit body when includeRawAttribution is false', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
      includeRawAttribution: false,
    });

    const metricReportFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;

    metricReportFunc({
      name: 'CLS',
      value: 22,
      rating: 'good',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: { largestShiftValue: 1.5 },
    } as MetricWithAttribution);

    const record = memoryExporter.getFinishedLogRecords()[0];
    expect(record.body).to.be.undefined;
  });

  it('should not register reportAllChanges listeners when urlAttribution is false', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    expect(inpStub.callCount).to.equal(1);
    expect(lcpStub.callCount).to.equal(1);
    expect(clsStub.callCount).to.equal(1);
  });

  describe('SPA url attribution', () => {
    it('should attribute the correct URL for INP metrics', () => {
      const testDocument = { URL: 'https://first.com' };
      const pageManager = new EmbracePageManager();
      pageManager.setCurrentRoute({ path: '/first/:id', url: '/first/123' });

      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument: testDocument,
        pageManager,
      });

      void expect(inpStub.callCount).to.equal(2);
      const changeFunc = inpStub.getCall(0).args[0] as WebVitalOnReport;
      const finalFunc = inpStub.getCall(1).args[0] as WebVitalOnReport;

      const inpMetric = {
        name: 'INP',
        value: 22,
        rating: 'poor',
        delta: 0,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {
          interactionTarget: 'some-target',
          interactionTime: 19000,
          nextPaintTime: 18000,
          interactionType: 'pointer',
          processedEventEntries: [],
          longAnimationFrameEntries: [],
          inputDelay: 1000,
          processingDuration: 2000,
          presentationDelay: 3000,
          loadState: 'complete',
        },
      } as MetricWithAttribution;

      changeFunc(inpMetric);
      testDocument.URL = 'https://second.com';
      pageManager.setCurrentRoute({ path: '/second/:id', url: '/second/123' });
      const attributedPageID = pageManager.getCurrentPageId();
      changeFunc(inpMetric);
      testDocument.URL = 'https://third.com';
      pageManager.setCurrentRoute({ path: '/third/:id', url: '/third/123' });
      finalFunc(inpMetric);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      expect(records[0].attributes).to.deep.include({
        [KEY_EMB_PAGE_PATH]: '/second/:id',
        [KEY_EMB_PAGE_ID]: attributedPageID,
      });
      const inpBody = JSON.parse(records[0].body as string) as Record<
        string,
        unknown
      >;
      expect(inpBody['interactionTarget']).to.equal('some-target');
      expect(inpBody['interactionTime']).to.equal(19000);
      expect(inpBody['inputDelay']).to.equal(1000);
      expect(inpBody['processingDuration']).to.equal(2000);
      expect(inpBody['presentationDelay']).to.equal(3000);
      expect(inpBody['loadState']).to.equal('complete');
    });

    it('should attribute the correct URL for LCP metrics', () => {
      const testDocument = { URL: 'https://first.com' };
      const pageManager = new EmbracePageManager();
      pageManager.setCurrentRoute({ path: '/first/:id', url: '/first/123' });

      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument: testDocument,
        pageManager,
      });

      void expect(lcpStub.callCount).to.equal(2);
      const changeFunc = lcpStub.getCall(0).args[0] as WebVitalOnReport;
      const finalFunc = lcpStub.getCall(1).args[0] as WebVitalOnReport;

      const lcpMetric = {
        name: 'LCP',
        value: 22,
        rating: 'poor',
        delta: 0,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {
          timeToFirstByte: 999,
          resourceLoadDelay: 1000,
          resourceLoadDuration: 2000,
          elementRenderDelay: 3000,
        },
      } as MetricWithAttribution;

      changeFunc(lcpMetric);
      testDocument.URL = 'https://second.com';
      pageManager.setCurrentRoute({ path: '/second/:id', url: '/second/123' });
      const attributedPageID = pageManager.getCurrentPageId();
      changeFunc(lcpMetric);
      testDocument.URL = 'https://third.com';
      pageManager.setCurrentRoute({ path: '/third/:id', url: '/third/123' });
      finalFunc(lcpMetric);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      expect(records[0].attributes).to.deep.include({
        [KEY_EMB_PAGE_PATH]: '/second/:id',
        [KEY_EMB_PAGE_ID]: attributedPageID,
      });
      const lcpBody = JSON.parse(records[0].body as string) as Record<
        string,
        unknown
      >;
      expect(lcpBody['timeToFirstByte']).to.equal(999);
      expect(lcpBody['resourceLoadDelay']).to.equal(1000);
      expect(lcpBody['resourceLoadDuration']).to.equal(2000);
      expect(lcpBody['elementRenderDelay']).to.equal(3000);
    });

    it('should attribute the correct URL for CLS metrics based on largestShiftTarget changes', () => {
      const testDocument = { URL: 'https://first.com' };
      const pageManager = new EmbracePageManager();
      pageManager.setCurrentRoute({ path: '/first/:id', url: '/first/123' });

      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument: testDocument,
        pageManager,
      });

      void expect(clsStub.callCount).to.equal(2);
      const changeFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
      const finalFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

      const clsMetric = {
        name: 'CLS',
        value: 22,
        rating: 'poor',
        delta: 0,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: { largestShiftTarget: 'some-target-1' },
      } as CLSMetricWithAttribution;

      changeFunc(clsMetric);
      clsMetric.attribution.largestShiftTarget = 'some-target-2';
      testDocument.URL = 'https://second.com';
      pageManager.setCurrentRoute({ path: '/second/:id', url: '/second/123' });
      const attributedPageID = pageManager.getCurrentPageId();
      changeFunc(clsMetric);
      testDocument.URL = 'https://third.com';
      pageManager.setCurrentRoute({ path: '/third/:id', url: '/third/123' });
      changeFunc(clsMetric);
      finalFunc(clsMetric);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      expect(records[0].attributes).to.deep.include({
        [KEY_EMB_PAGE_PATH]: '/second/:id',
        [KEY_EMB_PAGE_ID]: attributedPageID,
      });
      const clsBody = JSON.parse(records[0].body as string) as Record<
        string,
        unknown
      >;
      expect(clsBody['largestShiftTarget']).to.equal('some-target-2');
    });

    it('should attribute the correct URL for FCP metrics', () => {
      const testDocument = { URL: 'https://first.com' };
      const pageManager = new EmbracePageManager();
      pageManager.setCurrentRoute({ path: '/first/:id', url: '/first/123' });

      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument: testDocument,
        pageManager,
      });

      void expect(fcpStub.callCount).to.equal(2);
      const changeFunc = fcpStub.getCall(0).args[0] as WebVitalOnReport;
      const finalFunc = fcpStub.getCall(1).args[0] as WebVitalOnReport;

      const fcpMetric = {
        name: 'FCP',
        value: 22,
        rating: 'poor',
        delta: 0,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {
          timeToFirstByte: 0,
          firstByteToFCP: 0,
          loadState: 'complete',
        },
      } as FCPMetricWithAttribution;

      changeFunc(fcpMetric);
      testDocument.URL = 'https://second.com';
      pageManager.setCurrentRoute({ path: '/second/:id', url: '/second/123' });
      const attributedPageID = pageManager.getCurrentPageId();
      changeFunc(fcpMetric);
      testDocument.URL = 'https://third.com';
      pageManager.setCurrentRoute({ path: '/third/:id', url: '/third/123' });
      finalFunc(fcpMetric);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      expect(records[0].attributes).to.deep.include({
        [KEY_EMB_PAGE_PATH]: '/second/:id',
        [KEY_EMB_PAGE_ID]: attributedPageID,
      });
      const fcpBody = JSON.parse(records[0].body as string) as Record<
        string,
        unknown
      >;
      expect(fcpBody['timeToFirstByte']).to.equal(0);
      expect(fcpBody['firstByteToFCP']).to.equal(0);
      expect(fcpBody['loadState']).to.equal('complete');
    });

    it('should attribute the correct URL for TTFB metrics', () => {
      const testDocument = { URL: 'https://first.com' };
      const pageManager = new EmbracePageManager();
      pageManager.setCurrentRoute({ path: '/first/:id', url: '/first/123' });

      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument: testDocument,
        pageManager,
      });

      void expect(ttfbStub.callCount).to.equal(2);
      const changeFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;
      const finalFunc = ttfbStub.getCall(1).args[0] as WebVitalOnReport;

      const ttfbMetric = {
        name: 'TTFB',
        value: 33,
        rating: 'poor',
        delta: 99,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {
          waitingDuration: 20,
          cacheDuration: 40,
          dnsDuration: 60,
          connectionDuration: 80,
          requestDuration: 100,
          navigationEntry: {
            redirectStart: 0,
            redirectEnd: 0,
            domainLookupStart: 10,
            domainLookupEnd: 20,
            connectStart: 20,
            connectEnd: 30,
            secureConnectionStart: 0,
            requestStart: 30,
            responseStart: 50,
            responseEnd: 60,
            startTime: 0,
          } as PerformanceNavigationTiming,
        },
      } as MetricWithAttribution;

      changeFunc(ttfbMetric);
      testDocument.URL = 'https://second.com';
      pageManager.setCurrentRoute({ path: '/second/:id', url: '/second/123' });
      const attributedPageID = pageManager.getCurrentPageId();
      changeFunc(ttfbMetric);
      testDocument.URL = 'https://third.com';
      pageManager.setCurrentRoute({ path: '/third/:id', url: '/third/123' });
      finalFunc(ttfbMetric);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      expect(records[0].attributes).to.deep.include({
        [KEY_EMB_PAGE_PATH]: '/second/:id',
        [KEY_EMB_PAGE_ID]: attributedPageID,
      });
      const ttfbBody = JSON.parse(records[0].body as string) as Record<
        string,
        unknown
      >;
      expect(ttfbBody['waitingDuration']).to.equal(20);
      expect(ttfbBody['cacheDuration']).to.equal(40);
      expect(ttfbBody['dnsDuration']).to.equal(60);
      expect(ttfbBody['connectionDuration']).to.equal(80);
      expect(ttfbBody['requestDuration']).to.equal(100);
    });
  });

  describe('page manager', () => {
    it('should attach page attributes when route is set', () => {
      const pageManager = new EmbracePageManager();
      pageManager.setCurrentRoute({ path: '/test/:id', url: '/test/123' });

      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument,
        pageManager,
      });

      void expect(clsStub.calledTwice).to.be.true;
      const pageTrackFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
      const emitFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

      clock.tick(5000);

      const metric = {
        name: 'CLS',
        value: 22,
        rating: 'good',
        delta: 0,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {},
      } as MetricWithAttribution;

      pageTrackFunc(metric);
      emitFunc(metric);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      expect(records[0].attributes).to.deep.include({
        [KEY_EMB_PAGE_PATH]: '/test/:id',
        [KEY_EMB_PAGE_ID]: pageManager.getCurrentPageId(),
      });
    });

    it('should attach page label when label is set', () => {
      const pageManager = new EmbracePageManager({
        useDocumentTitleAsPageLabel: false,
      });
      pageManager.setPageLabel('MyLabel');

      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument,
        pageManager,
      });

      const pageTrackFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
      const emitFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

      clock.tick(5000);

      const metric = {
        name: 'CLS',
        value: 22,
        rating: 'good',
        delta: 0,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {},
      } as MetricWithAttribution;

      pageTrackFunc(metric);
      emitFunc(metric);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records[0].attributes).to.deep.include({
        [KEY_APP_SURFACE_LABEL]: 'MyLabel',
      });
    });

    it('should not attach page label when label is not set', () => {
      const pageManager = new EmbracePageManager({
        useDocumentTitleAsPageLabel: false,
      });

      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument,
        pageManager,
      });

      const pageTrackFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
      const emitFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

      clock.tick(5000);

      const metric = {
        name: 'CLS',
        value: 22,
        rating: 'good',
        delta: 0,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {},
      } as MetricWithAttribution;

      pageTrackFunc(metric);
      emitFunc(metric);

      const records = memoryExporter.getFinishedLogRecords();
      void expect(records[0].attributes[KEY_APP_SURFACE_LABEL]).to.be.undefined;
    });

    it('should not attach page attributes when route is not set', () => {
      const pageManager = new EmbracePageManager();

      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument,
        pageManager,
      });

      const pageTrackFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
      const emitFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

      clock.tick(5000);

      const metric = {
        name: 'CLS',
        value: 22,
        rating: 'good',
        delta: 0,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {},
      } as MetricWithAttribution;

      pageTrackFunc(metric);
      emitFunc(metric);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      void expect(records[0].attributes[KEY_EMB_PAGE_PATH]).to.be.undefined;
      void expect(records[0].attributes[KEY_EMB_PAGE_ID]).to.be.undefined;
    });
  });

  describe('page attribution', () => {
    it('should include page URL in log record when urlAttribution is true', () => {
      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument: { URL: 'https://example.com/page-a' },
      });

      // reportAllChanges listener registered first, emission listener second
      void expect(clsStub.calledTwice).to.be.true;
      const pageTrackFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
      const emitFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

      const metric = {
        name: 'CLS',
        value: 0.1,
        rating: 'good',
        delta: 0.1,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {},
      } as MetricWithAttribution;

      pageTrackFunc(metric);
      emitFunc(metric);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      expect(records[0].attributes[KEY_BROWSER_URL_FULL]).to.equal(
        'https://example.com/page-a',
      );
    });

    it('should capture page URL at measurement time, not emission time', () => {
      const urlDocument = { URL: 'https://example.com/page-a' };

      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument,
      });

      const pageTrackFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
      const emitFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

      const metric = {
        name: 'CLS',
        value: 0.1,
        rating: 'good',
        delta: 0.1,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {},
      } as MetricWithAttribution;

      // Track page while on page-a
      pageTrackFunc(metric);

      // Simulate SPA navigation before emission
      urlDocument.URL = 'https://example.com/page-b';

      // Emit — should still use page-a (captured at measurement time)
      emitFunc(metric);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      expect(records[0].attributes[KEY_BROWSER_URL_FULL]).to.equal(
        'https://example.com/page-a',
      );
    });

    it('should include page route path and label from pageManager', () => {
      const mockPageManager = {
        setCurrentRoute: sinon.stub(),
        getCurrentRoute: sinon
          .stub()
          .returns({ path: '/products/:id', url: '/products/123' }),
        getCurrentPageId: sinon.stub().returns('page-id-123'),
        setPageLabel: sinon.stub(),
        getPageLabel: sinon.stub().returns('Product Page'),
        clearCurrentRoute: sinon.stub(),
      };

      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument: { URL: 'https://example.com/products/123' },
        pageManager: mockPageManager,
      });

      const pageTrackFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
      const emitFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

      const metric = {
        name: 'CLS',
        value: 0.1,
        rating: 'good',
        delta: 0.1,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {},
      } as MetricWithAttribution;

      pageTrackFunc(metric);
      emitFunc(metric);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      expect(records[0].attributes[KEY_EMB_PAGE_PATH]).to.equal(
        '/products/:id',
      );
      expect(records[0].attributes[KEY_EMB_PAGE_ID]).to.equal('page-id-123');
      expect(records[0].attributes[KEY_APP_SURFACE_LABEL]).to.equal(
        'Product Page',
      );
    });

    it('should not include page attributes when urlAttribution is false', () => {
      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlAttribution: false,
        urlDocument: { URL: 'https://example.com/page-a' },
      });

      void expect(clsStub.calledOnce).to.be.true;
      const emitFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;

      emitFunc({
        name: 'CLS',
        value: 0.1,
        rating: 'good',
        delta: 0.1,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {},
      } as MetricWithAttribution);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      expect(records[0].attributes[KEY_BROWSER_URL_FULL]).to.be.undefined;
    });

    it('should not include page attributes when no reportAllChanges callback has fired', () => {
      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlDocument: { URL: 'https://example.com/page-a' },
      });

      // Only call the emission listener, skip the reportAllChanges listener
      const emitFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

      emitFunc({
        name: 'CLS',
        value: 0.1,
        rating: 'good',
        delta: 0.1,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {},
      } as MetricWithAttribution);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      // No _attributedPage set yet → no page attrs
      expect(records[0].attributes[KEY_BROWSER_URL_FULL]).to.be.undefined;
    });
  });

  describe('PerformanceObserver unavailable', () => {
    let originalPerformanceObserver: typeof globalThis.PerformanceObserver;

    beforeEach(() => {
      originalPerformanceObserver = globalThis.PerformanceObserver;
      (globalThis as Record<string, unknown>)['PerformanceObserver'] =
        undefined;
    });

    afterEach(() => {
      (globalThis as Record<string, unknown>)['PerformanceObserver'] =
        originalPerformanceObserver;
    });

    it('should log debug and not register listeners when PerformanceObserver is undefined', () => {
      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlAttribution: false,
      });

      expect(clsStub.callCount).to.equal(0);
      expect(diag.getDebugLogs()).to.include(
        'PerformanceObserver not supported, web vitals will not be collected',
      );
    });
  });

  it('should not track page when urlAttribution listener fires while disabled', () => {
    const urlDocument = { URL: 'https://example.com/page-a' };

    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
      urlDocument,
    });

    const pageTrackFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
    const emitFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

    instrumentation.disable();

    const metric = {
      name: 'CLS',
      value: 0.1,
      rating: 'good',
      delta: 0.1,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: { largestShiftTarget: 'el' },
    } as MetricWithAttribution;

    // fires while disabled — should not update attributed page
    pageTrackFunc(metric);

    instrumentation.enable();
    emitFunc(metric);

    const records = memoryExporter.getFinishedLogRecords();
    expect(records).to.have.lengthOf(1);
    // attributed page was never captured (guard returned early) → no URL attr
    expect(records[0].attributes[KEY_BROWSER_URL_FULL]).to.be.undefined;
  });

  describe('applyCustomLogRecordData hook', () => {
    it('should call the hook and allow modifying the log record', () => {
      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlAttribution: false,
        applyCustomLogRecordData: (logRecord) => {
          logRecord.attributes = {
            ...logRecord.attributes,
            'custom.attr': 'custom-value',
          };
        },
      });

      const emitFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;

      emitFunc({
        name: 'CLS',
        value: 0.1,
        rating: 'good',
        delta: 0.1,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {},
      } as MetricWithAttribution);

      const records = memoryExporter.getFinishedLogRecords();
      expect(records).to.have.lengthOf(1);
      expect(records[0].attributes['custom.attr']).to.equal('custom-value');
    });

    it('should log an error when the hook throws', () => {
      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        listeners: mockWebVitalListeners,
        urlAttribution: false,
        applyCustomLogRecordData: () => {
          throw new Error('hook error');
        },
      });

      const emitFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;

      emitFunc({
        name: 'CLS',
        value: 0.1,
        rating: 'good',
        delta: 0.1,
        id: 'm1',
        entries: [],
        navigationType: 'navigate',
        attribution: {},
      } as MetricWithAttribution);

      // record is still emitted despite hook failure
      expect(memoryExporter.getFinishedLogRecords()).to.have.lengthOf(1);
      expect(diag.getErrorLogs()).to.include(
        'applyCustomLogRecordData hook failed',
      );
    });
  });
});
