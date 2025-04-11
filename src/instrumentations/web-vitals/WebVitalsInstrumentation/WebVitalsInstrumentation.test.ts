import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  session,
  type SpanSessionManager,
} from '../../../api-sessions/index.js';
import {
  InMemoryDiagLogger,
  MockPerformanceManager,
  setupTestTraceExporter,
} from '../../../testUtils/index.js';
import { EmbraceSpanSessionManager } from '../../../managers/index.js';
import { WebVitalsInstrumentation } from './WebVitalsInstrumentation.js';
import sinonChai from 'sinon-chai';
import type { WebVitalListeners, WebVitalOnReport } from './types.js';
import type { MetricWithAttribution } from 'web-vitals/attribution';
import { setupTestWebVitalListeners } from '../../../testUtils/setupTestWebVitalListeners/setupTestWebVitalListeners.js';

chai.use(sinonChai);
const { expect } = chai;

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
    spanSessionManager = new EmbraceSpanSessionManager();
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
      listeners: mockWebVitalListeners,
    });

    void expect(clsStub).to.have.been.calledOnce;
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
    });

    expect(clsEvent.time).to.deep.equal([5, 0]);
  });

  it('should report CLS metrics with largest shift time', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
    });

    void expect(clsStub).to.have.been.calledOnce;
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
        largestShiftTarget: 'some-target',
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
      'emb.web_vital.attribution.largestShiftTarget': '"some-target"',
      'emb.web_vital.attribution.largestShiftTime': 3000,
    });

    // Since we have a largestShiftTime attribution time should be based on that
    expect(clsEvent.time).to.deep.equal([3, 0]);
  });

  it('should not report FCP metrics by default', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
    });

    void expect(fcpStub).not.to.have.been.called;
  });

  it('should report FCP metrics when tracking is set to all', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      trackingLevel: 'all',
      listeners: mockWebVitalListeners,
    });

    void expect(fcpStub).to.have.been.calledOnce;
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
      'emb.web_vital.attribution.loadState': '"complete"',
    });

    expect(fcpEvent.time).to.deep.equal([5, 0]);
  });

  it('should report LCP metrics', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
    });

    void expect(lcpStub).to.have.been.calledOnce;
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
    });

    expect(lcpEvent.time).to.deep.equal([5, 0]);
  });

  it('should report INP metrics', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
    });

    void expect(inpStub).to.have.been.calledOnce;
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
      'emb.web_vital.attribution.interactionTarget': '"some-target"',
      'emb.web_vital.attribution.interactionTargetElement': undefined,
      'emb.web_vital.attribution.interactionTime': 19000,
      'emb.web_vital.attribution.interactionType': '"pointer"',
      'emb.web_vital.attribution.loadState': '"complete"',
      'emb.web_vital.attribution.longAnimationFrameEntries': '[]',
      'emb.web_vital.attribution.nextPaintTime': 18000,
      'emb.web_vital.attribution.presentationDelay': 3000,
      'emb.web_vital.attribution.processedEventEntries': '[]',
      'emb.web_vital.attribution.processingDuration': 2000,
    });

    // Time should be based on interactionTime from attribution
    expect(inpEvent.time).to.deep.equal([19, 0]);
  });

  it('should not report TTFB metrics by default', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
    });

    void expect(ttfbStub).not.to.have.been.called;
  });

  it('should report TTFB metrics when tracking is set to all', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      trackingLevel: 'all',
      listeners: mockWebVitalListeners,
    });

    void expect(ttfbStub).to.have.been.calledOnce;
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
    });

    expect(ttfbEvent.time).to.deep.equal([5, 0]);
  });

  it('should be able to report multiple metrics', () => {
    instrumentation = new WebVitalsInstrumentation({
      diag,
      perf,
      listeners: mockWebVitalListeners,
    });

    void expect(clsStub).to.have.been.calledOnce;
    const { args: clsArgs } = clsStub.callsArg(0);
    const clsReportFunc = clsArgs[0][0] as WebVitalOnReport;

    void expect(lcpStub).to.have.been.calledOnce;
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
    });

    expect(clsEvent.time).to.deep.equal([5, 0]);
    expect(lcpEvent.time).to.deep.equal([5, 0]);
  });
});
