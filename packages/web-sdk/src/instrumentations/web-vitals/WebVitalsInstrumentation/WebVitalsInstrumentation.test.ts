import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type {
  CLSMetricWithAttribution,
  FCPMetricWithAttribution,
  INPMetricWithAttribution,
  MetricWithAttribution,
} from 'web-vitals/attribution';
import {
  InMemoryDiagLogger,
  MockPerformanceManager,
  setupTestTraceExporter,
  setupTestWebVitalListeners,
} from '../../../../tests/utils/index.ts';
import type { SpanSessionManager } from '../../../api-sessions/index.ts';
import { session } from '../../../api-sessions/index.ts';
import type { URLDocument } from '../../../common/index.ts';
import {
  KEY_APP_SURFACE_LABEL,
  KEY_EMB_PAGE_ID,
  KEY_EMB_PAGE_PATH,
} from '../../../constants/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbracePageManager,
  EmbraceSpanSessionManager,
} from '../../../managers/index.ts';
import type { WebVitalListeners, WebVitalOnReport } from './types.ts';
import { WebVitalsInstrumentation } from './WebVitalsInstrumentation.ts';

chai.use(sinonChai);
const { expect } = chai;
const urlDocument: URLDocument = {
  URL: 'https://example.com',
};

describe('WebVitalsInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: WebVitalsInstrumentation;
  let diag: InMemoryDiagLogger;
  let spanSessionManager: SpanSessionManager;
  let perf: MockPerformanceManager;
  let clock: sinon.SinonFakeTimers;
  let mockWebVitalListeners: WebVitalListeners;
  let clsStub: sinon.SinonStub;
  let fcpStub: sinon.SinonStub;
  let lcpStub: sinon.SinonStub;
  let inpStub: sinon.SinonStub;
  let ttfbStub: sinon.SinonStub;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);
    diag = new InMemoryDiagLogger();
    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });
    session.setGlobalSessionManager(spanSessionManager);
    spanSessionManager.startSessionSpan();
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

  it('should report CLS metrics', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    void expect(clsStub.calledTwice).to.be.true;
    const { args } = clsStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);
    const clsEvent = sessionSpan.events[0];

    expect(clsEvent.name).to.be.equal('emb-web-vitals-report-CLS');

    expect(clsEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 0,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'CLS',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 22,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });

    expect(clsEvent.time).to.deep.equal([5, 0]);
  });

  it('should report CLS metrics with largest shift time and loadState', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    void expect(clsStub.calledTwice).to.be.true;
    const { args } = clsStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);
    const clsEvent = sessionSpan.events[0];

    expect(clsEvent.name).to.be.equal('emb-web-vitals-report-CLS');

    expect(clsEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 0,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'CLS',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 22,
      'emb.web_vital.attribution.largestShiftTarget': 'some-target',
      'emb.web_vital.attribution.largestShiftTime': 3000,
      'emb.web_vital.attribution.largestShiftValue': 3.0,
      'emb.web_vital.attribution.loadState': 'complete',
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });

    // Since we have a largestShiftTime attribution time should be based on that
    expect(clsEvent.time).to.deep.equal([3, 0]);
  });

  it('should report FCP metrics', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    void expect(fcpStub.calledTwice).to.be.true;
    const { args } = fcpStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);
    const fcpEvent = sessionSpan.events[0];

    expect(fcpEvent.name).to.be.equal('emb-web-vitals-report-FCP');

    expect(fcpEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 99,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'FCP',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'needs-improvement',
      'emb.web_vital.value': 33,
      'emb.web_vital.attribution.timeToFirstByte': 20,
      'emb.web_vital.attribution.firstByteToFCP': 40,
      'emb.web_vital.attribution.loadState': 'complete',
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });

    expect(fcpEvent.time).to.deep.equal([5, 0]);
  });

  it('should report LCP metrics', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    void expect(lcpStub.calledTwice).to.be.true;
    const { args } = lcpStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);
    const lcpEvent = sessionSpan.events[0];

    expect(lcpEvent.name).to.be.equal('emb-web-vitals-report-LCP');

    expect(lcpEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 0,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'LCP',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'poor',
      'emb.web_vital.value': 22,
      'emb.web_vital.attribution.timeToFirstByte': 999,
      'emb.web_vital.attribution.resourceLoadDelay': 1000,
      'emb.web_vital.attribution.resourceLoadDuration': 2000,
      'emb.web_vital.attribution.elementRenderDelay': 3000,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });

    expect(lcpEvent.time).to.deep.equal([5, 0]);
  });

  it('should report INP metrics', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    void expect(inpStub.calledTwice).to.be.true;
    const { args } = inpStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);
    const inpEvent = sessionSpan.events[0];

    expect(inpEvent.name).to.be.equal('emb-web-vitals-report-INP');

    expect(inpEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 0,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'INP',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'poor',
      'emb.web_vital.value': 22,
      'emb.web_vital.attribution.inputDelay': 1000,
      'emb.web_vital.attribution.interactionTarget': 'some-target',
      'emb.web_vital.attribution.interactionTime': 19000,
      'emb.web_vital.attribution.interactionType': 'pointer',
      'emb.web_vital.attribution.loadState': 'complete',
      'emb.web_vital.attribution.nextPaintTime': 18000,
      'emb.web_vital.attribution.presentationDelay': 3000,
      'emb.web_vital.attribution.processingDuration': 2000,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });

    // Time should be based on interactionTime from attribution
    expect(inpEvent.time).to.deep.equal([19, 0]);
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

    it('should include loaf_scripts in INP event', () => {
      instrumentation = new WebVitalsInstrumentation({
        diag,
        perf,
        urlDocument,
        listeners: mockWebVitalListeners,
      });

      void expect(inpStub.calledTwice).to.be.true;
      const { args } = inpStub.callsArg(0);
      const metricReportFunc = args[0][0] as WebVitalOnReport;

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

      spanSessionManager.endSessionSpan();
      const sessionSpan = memoryExporter.getFinishedSpans()[0];
      expect(sessionSpan.events).to.have.lengthOf(1);
      const loafScripts = JSON.parse(
        sessionSpan.events[0].attributes?.[
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
        urlDocument,
        listeners: mockWebVitalListeners,
      });

      const { args } = inpStub.callsArg(0);
      const metricReportFunc = args[0][0] as WebVitalOnReport;

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

      spanSessionManager.endSessionSpan();
      const sessionSpan = memoryExporter.getFinishedSpans()[0];
      const loafScripts = JSON.parse(
        sessionSpan.events[0].attributes?.[
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
        urlDocument,
        listeners: mockWebVitalListeners,
      });

      const { args } = inpStub.callsArg(0);
      const metricReportFunc = args[0][0] as WebVitalOnReport;

      fireINP(metricReportFunc, []);

      spanSessionManager.endSessionSpan();
      const sessionSpan = memoryExporter.getFinishedSpans()[0];
      expect(
        sessionSpan.events[0].attributes?.[
          'emb.web_vital.attribution.loaf_scripts'
        ],
      ).to.be.undefined;
    });
  });

  it('should report TTFB metrics', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    void expect(ttfbStub.calledTwice).to.be.true;
    const { args } = ttfbStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);
    const ttfbEvent = sessionSpan.events[0];

    expect(ttfbEvent.name).to.be.equal('emb-web-vitals-report-TTFB');

    expect(ttfbEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 99,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'TTFB',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'poor',
      'emb.web_vital.value': 33,
      'emb.web_vital.attribution.waitingDuration': 20,
      'emb.web_vital.attribution.cacheDuration': 40,
      'emb.web_vital.attribution.dnsDuration': 60,
      'emb.web_vital.attribution.connectionDuration': 80,
      'emb.web_vital.attribution.requestDuration': 100,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 10,
      'emb.web_vital.attribution.tcpConnection': 10,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 20,
      'emb.web_vital.attribution.unattributed': 20,
    });

    expect(ttfbEvent.time).to.deep.equal([5, 0]);
  });

  it('should omit TTFB sub-parts when navigationEntry is absent', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = ttfbStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

    metricReportFunc({
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
    } as MetricWithAttribution);

    spanSessionManager.endSessionSpan();
    const sessionSpan = memoryExporter.getFinishedSpans()[0];
    const ttfbEvent = sessionSpan.events[0];

    expect(ttfbEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 33,
      'emb.web_vital.id': 'm2',
      'emb.web_vital.name': 'TTFB',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 33,
      'emb.web_vital.attribution.waitingDuration': 20,
      'emb.web_vital.attribution.cacheDuration': 0,
      'emb.web_vital.attribution.dnsDuration': 0,
      'emb.web_vital.attribution.connectionDuration': 0,
      'emb.web_vital.attribution.requestDuration': 33,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });
  });

  it('should compute TTFB sub-parts correctly with TLS', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = ttfbStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const sessionSpan = memoryExporter.getFinishedSpans()[0];
    const ttfbEvent = sessionSpan.events[0];

    // TLS: tcpConnection = secureConnectionStart - connectStart = 40 - 20 = 20
    //      tlsNegotiation = connectEnd - secureConnectionStart = 50 - 40 = 10
    // serverResponse = responseStart - requestStart = 70 - 50 = 20
    // other = 90 - 0 - 0 - 10 - 20 - 10 - 20 = 30
    expect(ttfbEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 80,
      'emb.web_vital.id': 'm3',
      'emb.web_vital.name': 'TTFB',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 80,
      'emb.web_vital.attribution.waitingDuration': 0,
      'emb.web_vital.attribution.cacheDuration': 0,
      'emb.web_vital.attribution.dnsDuration': 10,
      'emb.web_vital.attribution.connectionDuration': 20,
      'emb.web_vital.attribution.requestDuration': 30,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 10,
      'emb.web_vital.attribution.tcpConnection': 20,
      'emb.web_vital.attribution.tlsNegotiation': 10,
      'emb.web_vital.attribution.serverResponse': 20,
      'emb.web_vital.attribution.unattributed': 30,
    });
  });

  it('should use finalResponseHeadersStart for serverResponse when greater than responseStart', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = ttfbStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const sessionSpan = memoryExporter.getFinishedSpans()[0];
    const ttfbEvent = sessionSpan.events[0];

    // finalResponseHeadersStart (70) > responseStart (50), so serverResponse = 70 - 10 = 60
    // other = max(0, 80 - 0 - 0 - 0 - 0 - 0 - 60) = 20
    expect(ttfbEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 80,
      'emb.web_vital.id': 'm4',
      'emb.web_vital.name': 'TTFB',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 80,
      'emb.web_vital.attribution.waitingDuration': 0,
      'emb.web_vital.attribution.cacheDuration': 0,
      'emb.web_vital.attribution.connectionDuration': 0,
      'emb.web_vital.attribution.dnsDuration': 0,
      'emb.web_vital.attribution.requestDuration': 50,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 0,
      'emb.web_vital.attribution.tcpConnection': 0,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 60,
      'emb.web_vital.attribution.unattributed': 20,
    });
  });

  it('should fall back to responseStart when finalResponseHeadersStart is less than responseStart', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = ttfbStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const sessionSpan = memoryExporter.getFinishedSpans()[0];
    const ttfbEvent = sessionSpan.events[0];

    // finalResponseHeadersStart (30) < responseStart (50), falls back to responseStart
    // serverResponse = responseStart - requestStart = 50 - 10 = 40
    // other = max(0, 80 - 0 - 0 - 0 - 0 - 0 - 40) = 40
    expect(ttfbEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 80,
      'emb.web_vital.id': 'm4',
      'emb.web_vital.name': 'TTFB',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 80,
      'emb.web_vital.attribution.waitingDuration': 0,
      'emb.web_vital.attribution.cacheDuration': 0,
      'emb.web_vital.attribution.connectionDuration': 0,
      'emb.web_vital.attribution.dnsDuration': 0,
      'emb.web_vital.attribution.requestDuration': 40,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 0,
      'emb.web_vital.attribution.tcpConnection': 0,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 40,
      'emb.web_vital.attribution.unattributed': 40,
    });
  });

  it('should compute TTFB sub-parts correctly with non-zero redirect', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = ttfbStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const sessionSpan = memoryExporter.getFinishedSpans()[0];
    const ttfbEvent = sessionSpan.events[0];

    // redirect: 25 - 5 = 20
    // dns: 35 - 25 = 10
    // tcp: 45 - 35 = 10 (no TLS)
    // tls: 0
    // server: 75 - 45 = 30
    // other: 100 - 0 - 20 - 10 - 10 - 0 - 30 = 30
    expect(ttfbEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 100,
      'emb.web_vital.id': 'm5',
      'emb.web_vital.name': 'TTFB',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'needs-improvement',
      'emb.web_vital.value': 100,
      'emb.web_vital.attribution.waitingDuration': 0,
      'emb.web_vital.attribution.cacheDuration': 0,
      'emb.web_vital.attribution.dnsDuration': 10,
      'emb.web_vital.attribution.connectionDuration': 10,
      'emb.web_vital.attribution.requestDuration': 30,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
      'emb.web_vital.attribution.redirect': 20,
      'emb.web_vital.attribution.domainLookup': 10,
      'emb.web_vital.attribution.tcpConnection': 10,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 30,
      'emb.web_vital.attribution.unattributed': 30,
    });
  });

  it('should round fractional TTFB sub-part values to nearest millisecond', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = ttfbStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const sessionSpan = memoryExporter.getFinishedSpans()[0];
    const ttfbEvent = sessionSpan.events[0];

    // total: round(7.3 - 5.123) = round(2.177) = 2
    // dns: round(5.6 - 5.2) = round(0.4) = 0
    // tcp: round(6.1 - 5.6) = round(0.5) = 1
    // server: round(6.8 - 6.1) = round(0.7) = 1
    // unattributed: 2 - 0 - 0 - 1 - 0 - 1 = 0
    expect(ttfbEvent.attributes).to.deep.include({
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 0,
      'emb.web_vital.attribution.tcpConnection': 1,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 1,
      'emb.web_vital.attribution.unattributed': 0,
    });
  });

  it('should clamp negative TTFB sub-part durations to 0', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = ttfbStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const sessionSpan = memoryExporter.getFinishedSpans()[0];
    const ttfbEvent = sessionSpan.events[0];

    // redirect: 5 - 10 = -5 -> clamped to 0
    // dns: 15 - 20 = -5 -> clamped to 0
    // tcp: 25 - 30 = -5 -> clamped to 0
    // tls: 0 (no secure connection)
    // server: 35 - 40 = -5 -> clamped to 0
    // other: 50 - 0 - 0 - 0 - 0 - 0 - 0 = 50
    expect(ttfbEvent.attributes).to.deep.include({
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 0,
      'emb.web_vital.attribution.tcpConnection': 0,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 0,
      'emb.web_vital.attribution.unattributed': 50,
    });
  });

  it('should round fractional negative TTFB sub-part durations to 0', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = ttfbStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const sessionSpan = memoryExporter.getFinishedSpans()[0];
    const ttfbEvent = sessionSpan.events[0];

    // redirect: 9.7 - 10 = -0.3 -> clamped to 0
    // dns: 19.4 - 20 = -0.6 -> clamped to 0
    // tcp: 29.8 - 30 = -0.2 -> clamped to 0
    // tls: 0 (no secure connection)
    // server: 39.3 - 40 = -0.7 -> clamped to 0
    // unattributed: 50 - 0 - 0 - 0 - 0 - 0 = 50
    expect(ttfbEvent.attributes).to.deep.include({
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 0,
      'emb.web_vital.attribution.tcpConnection': 0,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 0,
      'emb.web_vital.attribution.unattributed': 50,
    });
  });

  it('should ensure TTFB sub-parts sum to rounded total', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = ttfbStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

    // Fractional values chosen so independent rounding would overshoot the total
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

    spanSessionManager.endSessionSpan();
    const sessionSpan = memoryExporter.getFinishedSpans()[0];
    const ttfbEvent = sessionSpan.events[0];

    const attrs = ttfbEvent.attributes as Record<string, number>;
    const redirect = attrs['emb.web_vital.attribution.redirect'];
    const domainLookup = attrs['emb.web_vital.attribution.domainLookup'];
    const tcpConnection = attrs['emb.web_vital.attribution.tcpConnection'];
    const tlsNegotiation = attrs['emb.web_vital.attribution.tlsNegotiation'];
    const serverResponse = attrs['emb.web_vital.attribution.serverResponse'];
    const unattributed = attrs['emb.web_vital.attribution.unattributed'];

    // total: round(8.7 - 0.2) = round(8.5) = 9
    // dns: round(1.6 - 1.1) = round(0.5) = 1
    // tcp: round(2.1 - 1.6) = round(0.5) = 1
    // tls: round(3.8 - 2.1) = round(1.7) = 2
    // server: round(6.3 - 3.8) = round(2.5) = 3
    // unattributed: 9 - 0 - 1 - 1 - 2 - 3 = 2
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
  });

  it('should compute TTFB other correctly with non-zero startTime', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = ttfbStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const sessionSpan = memoryExporter.getFinishedSpans()[0];
    const ttfbEvent = sessionSpan.events[0];

    // dns: 30 - 20 = 10
    // tcp: 40 - 30 = 10
    // server: 60 - 40 = 20
    // other: 80 - 10 - 0 - 10 - 10 - 0 - 20 = 30
    expect(ttfbEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 80,
      'emb.web_vital.id': 'm7',
      'emb.web_vital.name': 'TTFB',
      'emb.web_vital.navigation_type': 'back-forward',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 80,
      'emb.web_vital.attribution.waitingDuration': 0,
      'emb.web_vital.attribution.cacheDuration': 0,
      'emb.web_vital.attribution.dnsDuration': 10,
      'emb.web_vital.attribution.connectionDuration': 10,
      'emb.web_vital.attribution.requestDuration': 20,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
      'emb.web_vital.attribution.redirect': 0,
      'emb.web_vital.attribution.domainLookup': 10,
      'emb.web_vital.attribution.tcpConnection': 10,
      'emb.web_vital.attribution.tlsNegotiation': 0,
      'emb.web_vital.attribution.serverResponse': 20,
      'emb.web_vital.attribution.unattributed': 30,
    });
  });

  it('should be able to report multiple metrics', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    void expect(clsStub.calledTwice).to.be.true;
    const { args: clsArgs } = clsStub.callsArg(0);
    const clsReportFunc = clsArgs[0][0] as WebVitalOnReport;

    void expect(lcpStub.calledTwice).to.be.true;
    const { args: lcpArgs } = lcpStub.callsArg(0);
    const lcpReportFunc = lcpArgs[0][0] as WebVitalOnReport;

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
        timeToFirstByte: 999,
        resourceLoadDelay: 1000,
        resourceLoadDuration: 2000,
        elementRenderDelay: 3000,
      },
    } as MetricWithAttribution);

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(2);
    const clsEvent = sessionSpan.events[0];
    const lcpEvent = sessionSpan.events[1];

    expect(clsEvent.name).to.be.equal('emb-web-vitals-report-CLS');
    expect(lcpEvent.name).to.be.equal('emb-web-vitals-report-LCP');

    expect(clsEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 0,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'CLS',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 22,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });
    expect(lcpEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 0,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'LCP',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'poor',
      'emb.web_vital.value': 22,
      'emb.web_vital.attribution.timeToFirstByte': 999,
      'emb.web_vital.attribution.resourceLoadDelay': 1000,
      'emb.web_vital.attribution.resourceLoadDuration': 2000,
      'emb.web_vital.attribution.elementRenderDelay': 3000,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });

    expect(clsEvent.time).to.deep.equal([5, 0]);
    expect(lcpEvent.time).to.deep.equal([5, 0]);
  });

  it('should attribute the correct URL for INP metrics', () => {
    const testDocument: URLDocument = {
      URL: 'https://first.com',
    };
    const pageManager = new EmbracePageManager();
    pageManager.setCurrentRoute({
      path: '/first/:id',
      url: '/first/123',
    });
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument: testDocument,
      pageManager,
      listeners: mockWebVitalListeners,
      urlAttribution: true,
    });

    void expect(inpStub.callCount).to.equal(2);
    const inpFinalReportFunc = inpStub.getCall(0).args[0] as WebVitalOnReport;
    const inpChangeReportFunc = inpStub.getCall(1).args[0] as WebVitalOnReport;

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

    inpChangeReportFunc(inpMetric);
    // should be attributed to this URL since that is when the last change to the metric occurred
    testDocument.URL = 'https://second.com';
    pageManager.setCurrentRoute({
      path: '/second/:id',
      url: '/second/123',
    });
    const attributedPageID = pageManager.getCurrentPageId();
    inpChangeReportFunc(inpMetric);
    testDocument.URL = 'https://third.com';
    pageManager.setCurrentRoute({
      path: '/third/:id',
      url: '/third/123',
    });
    inpFinalReportFunc(inpMetric);

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    const inpEvent = sessionSpan.events[0];

    expect(inpEvent.name).to.be.equal('emb-web-vitals-report-INP');
    expect(inpEvent.attributes).to.containSubset({
      'url.full': 'https://second.com',
      'app.surface.name': '/second/:id',
      'app.surface.id': attributedPageID,
    });
  });

  it('should attribute the correct URL for LCP metrics', () => {
    const testDocument: URLDocument = {
      URL: 'https://first.com',
    };
    const pageManager = new EmbracePageManager();
    pageManager.setCurrentRoute({
      path: '/first/:id',
      url: '/first/123',
    });
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      pageManager,
      urlDocument: testDocument,
      listeners: mockWebVitalListeners,
      urlAttribution: true,
    });

    void expect(lcpStub.callCount).to.equal(2);
    const lcpFinalReportFunc = lcpStub.getCall(0).args[0] as WebVitalOnReport;
    const lcpChangeReportFunc = lcpStub.getCall(1).args[0] as WebVitalOnReport;

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

    lcpChangeReportFunc(lcpMetric);
    // should be attributed to this URL since that is when the last change to the metric occurred
    testDocument.URL = 'https://second.com';
    pageManager.setCurrentRoute({
      path: '/second/:id',
      url: '/second/123',
    });
    const attributedPageID = pageManager.getCurrentPageId();
    lcpChangeReportFunc(lcpMetric);
    testDocument.URL = 'https://third.com';
    pageManager.setCurrentRoute({
      path: '/third/:id',
      url: '/third/123',
    });
    lcpFinalReportFunc(lcpMetric);

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    const lcpEvent = sessionSpan.events[0];

    expect(lcpEvent.name).to.be.equal('emb-web-vitals-report-LCP');
    expect(lcpEvent.attributes).to.containSubset({
      'url.full': 'https://second.com',
      'app.surface.name': '/second/:id',
      'app.surface.id': attributedPageID,
    });
  });

  it('should attribute the correct URL for CLS metrics', () => {
    const testDocument: URLDocument = {
      URL: 'https://first.com',
    };
    const pageManager = new EmbracePageManager();
    pageManager.setCurrentRoute({
      path: '/first/:id',
      url: '/first/123',
    });
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      pageManager,
      urlDocument: testDocument,
      listeners: mockWebVitalListeners,
      urlAttribution: true,
    });

    void expect(clsStub.callCount).to.equal(2);
    const clsFinalReportFunc = clsStub.getCall(0).args[0] as WebVitalOnReport;
    const clsChangeReportFunc = clsStub.getCall(1).args[0] as WebVitalOnReport;

    const clsMetric = {
      name: 'CLS',
      value: 22,
      rating: 'poor',
      delta: 0,
      id: 'm1',
      entries: [],
      navigationType: 'navigate',
      attribution: {
        largestShiftTarget: 'some-target-1',
      },
    } as CLSMetricWithAttribution;

    clsChangeReportFunc(clsMetric);
    // should be attributed to this URL since that is when the last change to the metric occurred and largestShiftTarget
    // was changed
    clsMetric.attribution.largestShiftTarget = 'some-target-2';
    testDocument.URL = 'https://second.com';
    pageManager.setCurrentRoute({
      path: '/second/:id',
      url: '/second/123',
    });
    const attributedPageID = pageManager.getCurrentPageId();
    clsChangeReportFunc(clsMetric);
    // should NOT be attributed to this URL since the largestShiftTarget didn't change
    testDocument.URL = 'https://third.com';
    pageManager.setCurrentRoute({
      path: '/third/:id',
      url: '/third/123',
    });
    clsChangeReportFunc(clsMetric);
    clsFinalReportFunc(clsMetric);

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    const clsEvent = sessionSpan.events[0];

    expect(clsEvent.name).to.be.equal('emb-web-vitals-report-CLS');
    expect(clsEvent.attributes).to.containSubset({
      'url.full': 'https://second.com',
      'app.surface.name': '/second/:id',
      'app.surface.id': attributedPageID,
    });
  });

  it('should attribute the correct URL for FCP metrics', () => {
    const testDocument: URLDocument = {
      URL: 'https://first.com',
    };
    const pageManager = new EmbracePageManager();
    pageManager.setCurrentRoute({
      path: '/first/:id',
      url: '/first/123',
    });
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      pageManager,
      urlDocument: testDocument,
      listeners: mockWebVitalListeners,
      urlAttribution: true,
    });

    void expect(fcpStub.callCount).to.equal(2);
    const fcpFinalReportFunc = fcpStub.getCall(0).args[0] as WebVitalOnReport;
    const fcpChangeReportFunc = fcpStub.getCall(1).args[0] as WebVitalOnReport;

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

    fcpChangeReportFunc(fcpMetric);

    testDocument.URL = 'https://second.com';
    pageManager.setCurrentRoute({
      path: '/second/:id',
      url: '/second/123',
    });
    const attributedPageID = pageManager.getCurrentPageId();
    fcpChangeReportFunc(fcpMetric);
    // should NOT be attributed to this URL since the metric hasn't changed
    testDocument.URL = 'https://third.com';
    pageManager.setCurrentRoute({
      path: '/third/:id',
      url: '/third/123',
    });
    fcpFinalReportFunc(fcpMetric);

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    const fcpEvent = sessionSpan.events[0];

    expect(fcpEvent.name).to.be.equal('emb-web-vitals-report-FCP');
    expect(fcpEvent.attributes).to.containSubset({
      'url.full': 'https://second.com',
      'app.surface.name': '/second/:id',
      'app.surface.id': attributedPageID,
    });
  });

  it('should attribute the correct URL for TTFB metrics', () => {
    const testDocument: URLDocument = {
      URL: 'https://first.com',
    };
    const pageManager = new EmbracePageManager();
    pageManager.setCurrentRoute({
      path: '/first/:id',
      url: '/first/123',
    });
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      pageManager,
      urlDocument: testDocument,
      listeners: mockWebVitalListeners,
      urlAttribution: true,
    });

    void expect(ttfbStub.callCount).to.equal(2);
    const ttfbFinalReportFunc = ttfbStub.getCall(0).args[0] as WebVitalOnReport;
    const ttfbChangeReportFunc = ttfbStub.getCall(1)
      .args[0] as WebVitalOnReport;

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

    ttfbChangeReportFunc(ttfbMetric);
    // should be attributed to this URL since that is when the last change to the metric occurred
    testDocument.URL = 'https://second.com';
    pageManager.setCurrentRoute({
      path: '/second/:id',
      url: '/second/123',
    });
    const attributedPageID = pageManager.getCurrentPageId();
    ttfbChangeReportFunc(ttfbMetric);
    testDocument.URL = 'https://third.com';
    pageManager.setCurrentRoute({
      path: '/third/:id',
      url: '/third/123',
    });
    ttfbFinalReportFunc(ttfbMetric);

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);

    const ttfbEvent = sessionSpan.events[0];

    expect(ttfbEvent.name).to.be.equal('emb-web-vitals-report-TTFB');
    expect(ttfbEvent.attributes).to.containSubset({
      'url.full': 'https://second.com',
      'app.surface.name': '/second/:id',
      'app.surface.id': attributedPageID,
    });
  });

  it('should attach page attributes when route is set', () => {
    const pageManager = new EmbracePageManager();
    pageManager.setCurrentRoute({
      path: '/test/:id',
      url: '/test/123',
    });

    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
      pageManager,
    });

    void expect(clsStub.calledTwice).to.be.true;
    const { args } = clsStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);
    const clsEvent = sessionSpan.events[0];

    expect(clsEvent.attributes).to.containSubset({
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
      urlDocument,
      listeners: mockWebVitalListeners,
      pageManager,
    });

    void expect(clsStub.calledTwice).to.be.true;
    const { args } = clsStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    const sessionSpan = finishedSpans[0];
    const clsEvent = sessionSpan.events[0];

    expect(clsEvent.attributes).to.containSubset({
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
      urlDocument,
      listeners: mockWebVitalListeners,
      pageManager,
    });

    void expect(clsStub.calledTwice).to.be.true;
    const { args } = clsStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    const sessionSpan = finishedSpans[0];
    const clsEvent = sessionSpan.events[0];

    void expect(clsEvent.attributes?.[KEY_APP_SURFACE_LABEL]).to.be.undefined;
  });

  it('should not attach page attributes when route is not set', () => {
    const pageManager = new EmbracePageManager();

    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
      pageManager,
    });

    void expect(clsStub.calledTwice).to.be.true;
    const { args } = clsStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.events).to.have.lengthOf(1);
    const clsEvent = sessionSpan.events[0];

    void expect(clsEvent.attributes?.[KEY_EMB_PAGE_PATH]).to.be.undefined;
    void expect(clsEvent.attributes?.[KEY_EMB_PAGE_ID]).to.be.undefined;
  });

  it('should not register duplicate callbacks when enable() is called multiple times', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    // Call enable() multiple times
    instrumentation.enable();
    instrumentation.enable();

    expect(clsStub.callCount).to.equal(2);
  });

  it('should log debug message when enable() is called on already registered listeners', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    instrumentation.enable();

    expect(diag.getDebugLogs()).to.include(
      'WebVitalsInstrumentation listeners already registered, resuming emission',
    );
  });

  it('should pause emission when disable() is called', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = clsStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

    // First metric should be recorded
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

    // Disable and try to record another metric
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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    const sessionSpan = finishedSpans[0];

    // Only the first metric should be recorded
    expect(sessionSpan.events).to.have.lengthOf(1);
    expect(sessionSpan.events[0].attributes?.['emb.web_vital.id']).to.equal(
      'm1',
    );
  });

  it('should resume emission when enable() is called after disable()', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = clsStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    const sessionSpan = finishedSpans[0];

    expect(sessionSpan.events).to.have.lengthOf(1);
  });

  it('should log debug message when disable() is called', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    instrumentation.disable();

    expect(diag.getDebugLogs()).to.include(
      'WebVitalsInstrumentation disabled, pausing emission',
    );
  });

  it('should filter out non-primitive attribution values', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = inpStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    const sessionSpan = finishedSpans[0];
    const inpEvent = sessionSpan.events[0];

    expect(inpEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 0,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'INP',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 100,
      'emb.web_vital.attribution.interactionTarget': 'some-target',
      'emb.web_vital.attribution.interactionTime': 19000,
      'emb.web_vital.attribution.loadState': 'complete',
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });
  });

  it('should preserve falsy primitive attribution values', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = clsStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    const sessionSpan = finishedSpans[0];
    const clsEvent = sessionSpan.events[0];

    expect(clsEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 0,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'CLS',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 0,
      'emb.web_vital.attribution.largestShiftValue': 0,
      'emb.web_vital.attribution.loadState': '',
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });
  });

  it('should handle null attribution gracefully', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = fcpStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    const sessionSpan = finishedSpans[0];
    const fcpEvent = sessionSpan.events[0];

    expect(fcpEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 0,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'FCP',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 0,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });
  });

  it('should include boolean attribution values', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
    });

    const { args } = clsStub.callsArg(0);
    const metricReportFunc = args[0][0] as WebVitalOnReport;

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

    spanSessionManager.endSessionSpan();
    const finishedSpans = memoryExporter.getFinishedSpans();
    const sessionSpan = finishedSpans[0];
    const clsEvent = sessionSpan.events[0];

    expect(clsEvent.attributes).to.deep.equal({
      'emb.type': 'ux.web_vital',
      'emb.web_vital.delta': 0,
      'emb.web_vital.id': 'm1',
      'emb.web_vital.name': 'CLS',
      'emb.web_vital.navigation_type': 'navigate',
      'emb.web_vital.rating': 'good',
      'emb.web_vital.value': 0,
      'emb.web_vital.attribution.largestShiftValue': 0,
      'emb.web_vital.attribution.hadRecentInput': false,
      'url.full': 'https://example.com',
      'browser.url.full': 'https://example.com',
    });
  });

  it('should not register reportAllChanges listeners when urlAttribution is false', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      urlDocument,
      listeners: mockWebVitalListeners,
      urlAttribution: false,
    });

    expect(inpStub.callCount).to.equal(1);
    expect(lcpStub.callCount).to.equal(1);
    expect(clsStub.callCount).to.equal(1);
  });
});
