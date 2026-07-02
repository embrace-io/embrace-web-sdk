/*
 * Adapted from OpenTelemetry document-load instrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-document-load
 */

import type { Attributes, HrTime } from '@opentelemetry/api';
import { context, propagation, trace } from '@opentelemetry/api';
import {
  TRACE_PARENT_HEADER,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  PerformanceTimingNames as PTN,
  StackContextManager,
} from '@opentelemetry/sdk-trace-web';

import { assert } from 'chai';
import type { SinonStubbedFunction } from 'sinon';
import * as sinon from 'sinon';
import { DocumentLoadInstrumentation } from './DocumentLoadInstrumentation.ts';
import { EventNames } from './enums/EventNames.ts';

const exporter = new InMemorySpanExporter();
const spanProcessor = new SimpleSpanProcessor(exporter);
const provider = new BasicTracerProvider({
  spanProcessors: [spanProcessor],
});
trace.setGlobalTracerProvider(provider);

const resources = [
  {
    name: 'http://localhost:8090/embrace-web-sdk.js',
    entryType: 'resource',
    startTime: 20.985000010114163,
    duration: 90.94999998342246,
    initiatorType: 'script',
    nextHopProtocol: 'http/1.1',
    workerStart: 0,
    redirectStart: 0,
    redirectEnd: 0,
    fetchStart: 20.985000010114163,
    domainLookupStart: 20.985000010114163,
    domainLookupEnd: 20.985000010114163,
    connectStart: 20.985000010114163,
    connectEnd: 20.985000010114163,
    secureConnectionStart: 20.985000010114163,
    requestStart: 29.28999997675419,
    responseStart: 31.88999998383224,
    responseEnd: 111.93499999353662,
    transferSize: 1446645,
    encodedBodySize: 1446396,
    decodedBodySize: 1446396,
    serverTiming: [],
  },
  {
    name: 'http://localhost:8090/sockjs-node/info?t=1572620894466',
    entryType: 'resource',
    startTime: 1998.5950000118464,
    duration: 4.209999984595925,
    initiatorType: 'xmlhttprequest',
    nextHopProtocol: 'http/1.1',
    workerStart: 0,
    redirectStart: 0,
    redirectEnd: 0,
    fetchStart: 1998.5950000118464,
    domainLookupStart: 1998.5950000118464,
    domainLookupEnd: 1998.5950000118464,
    connectStart: 1998.5950000118464,
    connectEnd: 1998.5950000118464,
    secureConnectionStart: 1998.5950000118464,
    requestStart: 2001.7900000093505,
    responseStart: 2002.3700000019744,
    responseEnd: 2002.8049999964423,
    transferSize: 368,
    encodedBodySize: 79,
    decodedBodySize: 79,
    serverTiming: [],
  },
];
const resourcesNoSecureConnectionStart = [
  {
    name: 'http://localhost:8090/embrace-web-sdk.js',
    entryType: 'resource',
    startTime: 20.985000010114163,
    duration: 90.94999998342246,
    initiatorType: 'script',
    nextHopProtocol: 'http/1.1',
    workerStart: 0,
    redirectStart: 0,
    redirectEnd: 0,
    fetchStart: 20.985000010114163,
    domainLookupStart: 20.985000010114163,
    domainLookupEnd: 20.985000010114163,
    connectStart: 20.985000010114163,
    connectEnd: 20.985000010114163,
    secureConnectionStart: 0,
    requestStart: 29.28999997675419,
    responseStart: 31.88999998383224,
    responseEnd: 111.93499999353662,
    transferSize: 1446645,
    encodedBodySize: 1446396,
    decodedBodySize: 1446396,
    serverTiming: [],
  },
];
const entries: PerformanceNavigationTiming = {
  name: 'http://localhost:8090/',
  entryType: 'navigation',
  startTime: 0,
  duration: 374.0100000286475,
  initiatorType: 'navigation',
  nextHopProtocol: 'http/1.1',
  workerStart: 0,
  redirectStart: 0,
  redirectEnd: 0,
  fetchStart: 0.7999999215826392,
  domainLookupStart: 0.7999999215826392,
  domainLookupEnd: 0.7999999215826392,
  connectStart: 0.7999999215826392,
  connectEnd: 0.7999999215826393,
  secureConnectionStart: 0.7999999215826392,
  requestStart: 4.480000003241003,
  responseStart: 5.729999975301325,
  responseEnd: 6.154999951831996,
  transferSize: 655,
  encodedBodySize: 362,
  decodedBodySize: 362,
  serverTiming: [],
  unloadEventStart: 12.63499993365258,
  unloadEventEnd: 13.514999998733401,
  domInteractive: 200.12499997392297,
  domContentLoadedEventStart: 200.13999997172505,
  domContentLoadedEventEnd: 201.6000000294298,
  domComplete: 370.62499998137355,
  loadEventStart: 370.64999993890524,
  loadEventEnd: 374.0100000286475,
  type: 'reload',
  redirectCount: 0,
  responseStatus: 200,
  toJSON: () => {},
};

const paintEntries: PerformanceEntryList = [
  {
    duration: 0,
    entryType: 'paint',
    name: 'first-paint',
    startTime: 7.480000003241003,
    toJSON: () => {},
  },
  {
    duration: 0,
    entryType: 'paint',
    name: 'first-contentful-paint',
    startTime: 8.480000003241003,
    toJSON: () => {},
  },
];

const userAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36';

const ensureNetworkEventsExists = (
  events: TimedEvent[],
  expectSecureConnectionStart = true,
) => {
  const expectedEventNames = [
    PTN.FETCH_START,
    PTN.DOMAIN_LOOKUP_START,
    PTN.DOMAIN_LOOKUP_END,
    PTN.CONNECT_START,
    expectSecureConnectionStart ? PTN.SECURE_CONNECTION_START : undefined,
    PTN.CONNECT_END,
    PTN.REQUEST_START,
    PTN.RESPONSE_START,
    PTN.RESPONSE_END,
  ].filter((n) => n);
  for (let i = 0; i < events.length; i++) {
    assert.strictEqual(events[i].name, expectedEventNames[i]);
  }
};

describe('DocumentLoad Instrumentation', () => {
  let plugin: DocumentLoadInstrumentation;
  let contextManager: StackContextManager;
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    contextManager = new StackContextManager().enable();
    context.setGlobalContextManager(contextManager);
    Object.defineProperty(window.document, 'readyState', {
      writable: true,
      value: 'complete',
    });
    sandbox.replaceGetter(navigator, 'userAgent', () => userAgent);
    plugin = new DocumentLoadInstrumentation({
      enabled: false,
    });
    plugin.setTracerProvider(provider);
    exporter.reset();
  });

  afterEach(() => {
    sandbox.restore();
    context.disable();
    Object.defineProperty(window.document, 'readyState', {
      writable: true,
      value: 'complete',
    });
    plugin.disable();
  });

  before(() => {
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  });

  describe('constructor', () => {
    it('should construct an instance', () => {
      plugin = new DocumentLoadInstrumentation({
        enabled: false,
      });
      assert.ok(plugin instanceof DocumentLoadInstrumentation);
    });
  });

  describe('when document readyState is complete', () => {
    let spyEntries: SinonStubbedFunction<PerformanceEntry[]>;
    beforeEach(() => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns([]);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });
    it('should start collecting the performance immediately', (done) => {
      plugin.enable();
      setTimeout(() => {
        assert.strictEqual(window.document.readyState, 'complete');
        assert.strictEqual(spyEntries.callCount, 3);
        done();
      });
    });
  });

  describe('when document readyState is not complete', () => {
    let spyEntries: SinonStubbedFunction<PerformanceEntry[]>;
    beforeEach(() => {
      Object.defineProperty(window.document, 'readyState', {
        writable: true,
        value: 'loading',
      });

      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns([]);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should collect performance after document load event', (done) => {
      const spy = sandbox.spy(window, 'addEventListener');
      plugin.enable();
      assert.ok(spy.args.some((args) => args[0] === 'load'));
      assert.ok(spyEntries.callCount === 0);

      window.dispatchEvent(
        new CustomEvent('load', {
          bubbles: true,
          cancelable: false,
          composed: true,
          detail: {},
        }),
      );
      setTimeout(() => {
        assert.strictEqual(spyEntries.callCount, 3);
        done();
      });
    });
  });

  describe('when navigation entries types are available', () => {
    let spyEntries: sinon.SinonStub;
    beforeEach(() => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns([]);
      spyEntries.withArgs('paint').returns(paintEntries);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should export correct span with events', (done) => {
      plugin.enable();

      setTimeout(() => {
        const rootSpan = exporter.getFinishedSpans()[0];
        const fetchSpan = exporter.getFinishedSpans()[1];
        const rsEvents = rootSpan.events;
        const fsEvents = fetchSpan.events;

        assert.strictEqual(rootSpan.name, 'documentFetch');
        assert.ok(
          (rootSpan.attributes['http.response_content_length'] as number) > 0,
        );
        assert.strictEqual(fetchSpan.name, 'documentLoad');
        ensureNetworkEventsExists(rsEvents);

        assert.strictEqual(fsEvents[9].name, EventNames.FIRST_PAINT);
        assert.strictEqual(
          fsEvents[10].name,
          EventNames.FIRST_CONTENTFUL_PAINT,
        );

        assert.strictEqual(fsEvents[0].name, PTN.FETCH_START);
        assert.strictEqual(fsEvents[1].name, PTN.UNLOAD_EVENT_START);
        assert.strictEqual(fsEvents[2].name, PTN.UNLOAD_EVENT_END);
        assert.strictEqual(fsEvents[3].name, PTN.DOM_INTERACTIVE);
        assert.strictEqual(
          fsEvents[4].name,
          PTN.DOM_CONTENT_LOADED_EVENT_START,
        );
        assert.strictEqual(fsEvents[5].name, PTN.DOM_CONTENT_LOADED_EVENT_END);
        assert.strictEqual(fsEvents[6].name, PTN.DOM_COMPLETE);
        assert.strictEqual(fsEvents[7].name, PTN.LOAD_EVENT_START);
        assert.strictEqual(fsEvents[8].name, PTN.LOAD_EVENT_END);

        assert.strictEqual(rsEvents.length, 9);
        assert.strictEqual(fsEvents.length, 11);
        assert.strictEqual(exporter.getFinishedSpans().length, 2);
        done();
      });
    });

    describe('AND window has information about server root span', () => {
      let spyGetElementsByTagName: SinonStubbedFunction<[string]>;
      beforeEach(() => {
        const element = {
          content: '00-ab42124a3c573678d4d8b21ba52df3bf-d21f7bc17caa5aba-01',
          getAttribute: (value: string) => {
            if (value === 'name') {
              return TRACE_PARENT_HEADER;
            }
            return undefined;
          },
        };

        spyGetElementsByTagName = sandbox.stub(
          window.document,
          'getElementsByTagName',
        );
        spyGetElementsByTagName.withArgs('meta').returns([element]);
      });
      afterEach(() => {
        spyGetElementsByTagName.restore();
      });

      it('should create a root span with server context traceId', (done) => {
        plugin.enable();
        setTimeout(() => {
          const rootSpan = exporter.getFinishedSpans()[0];
          const fetchSpan = exporter.getFinishedSpans()[1];
          assert.strictEqual(rootSpan.name, 'documentFetch');
          assert.strictEqual(fetchSpan.name, 'documentLoad');

          assert.strictEqual(
            rootSpan.spanContext().traceId,
            'ab42124a3c573678d4d8b21ba52df3bf',
          );
          assert.strictEqual(
            fetchSpan.spanContext().traceId,
            'ab42124a3c573678d4d8b21ba52df3bf',
          );

          assert.strictEqual(exporter.getFinishedSpans().length, 2);
          done();
        }, 100);
      });
    });
  });

  describe('when resource entries are available', () => {
    let spyEntries: SinonStubbedFunction<PerformanceEntry[]>;
    beforeEach(() => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns(resources);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should create span for each of the resource', (done) => {
      plugin.enable();
      setTimeout(() => {
        const spanResource1 = exporter.getFinishedSpans()[1];
        const spanResource2 = exporter.getFinishedSpans()[2];

        const srEvents1 = spanResource1.events;
        const srEvents2 = spanResource2.events;

        assert.strictEqual(
          spanResource1.attributes['url.full'],
          'http://localhost:8090/embrace-web-sdk.js',
        );
        assert.strictEqual(
          spanResource2.attributes['url.full'],
          'http://localhost:8090/sockjs-node/info?t=1572620894466',
        );

        ensureNetworkEventsExists(srEvents1);
        ensureNetworkEventsExists(srEvents2);

        assert.strictEqual(exporter.getFinishedSpans().length, 4);
        done();
      });
    });
  });
  describe('when resource entries are available AND secureConnectionStart is 0', () => {
    let spyEntries: SinonStubbedFunction<PerformanceEntry[]>;
    beforeEach(() => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns(resourcesNoSecureConnectionStart);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should create span for each of the resource', (done) => {
      plugin.enable();
      setTimeout(() => {
        const spanResource1 = exporter.getFinishedSpans()[1];

        const srEvents1 = spanResource1.events;

        assert.strictEqual(
          spanResource1.attributes['url.full'],
          'http://localhost:8090/embrace-web-sdk.js',
        );

        ensureNetworkEventsExists(srEvents1, false);

        assert.strictEqual(exporter.getFinishedSpans().length, 3);
        done();
      });
    });
  });

  describe('when navigation entries types are available and property "loadEventEnd" is missing', () => {
    let spyEntries: SinonStubbedFunction<PerformanceEntry[]>;
    beforeEach(() => {
      const entriesWithoutLoadEventEnd = Object.assign({}, entries);
      // @ts-expect-error navigation timing is readonly but this is a stub
      delete entriesWithoutLoadEventEnd.loadEventEnd;
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entriesWithoutLoadEventEnd]);
      spyEntries.withArgs('resource').returns([]);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should still export rootSpan and fetchSpan', (done) => {
      plugin.enable();

      setTimeout(() => {
        const rootSpan = exporter.getFinishedSpans()[0];
        const fetchSpan = exporter.getFinishedSpans()[1];

        assert.strictEqual(rootSpan.name, 'documentFetch');
        assert.strictEqual(fetchSpan.name, 'documentLoad');

        assert.strictEqual(exporter.getFinishedSpans().length, 2);
        done();
      });
    });
  });

  const shouldExportCorrectSpan = () => {
    it('should export correct span with events', (done) => {
      plugin.enable();
      setTimeout(() => {
        const fetchSpan = exporter.getFinishedSpans()[0];
        const rootSpan = exporter.getFinishedSpans()[1];
        const fsEvents = fetchSpan.events;
        const rsEvents = rootSpan.events;

        assert.strictEqual(fetchSpan.name, 'documentFetch');
        assert.strictEqual(rootSpan.name, 'documentLoad');

        assert.isOk(
          (fetchSpan.attributes['url.full'] as string).startsWith(
            'http://localhost:8000/?wtr-session-id=',
          ),
        );

        assert.isOk(
          (rootSpan.attributes['url.full'] as string).startsWith(
            'http://localhost:8000/?wtr-session-id=',
          ),
        );
        assert.strictEqual(
          rootSpan.attributes['user_agent.original'],
          userAgent,
        );

        ensureNetworkEventsExists(fsEvents);
        assert.strictEqual(fsEvents.length, 9);

        const rsEventNames = rsEvents.map((e) => e.name);
        // Allow the unloadEvent{Start,End} events to be missing. Tests that
        // are simulating a fallback to window.performance.timing are using
        // values (entriesFallback) for that result in those network span
        // events being dropped after https://github.com/open-telemetry/opentelemetry-js/pull/4486
        // (@opentelemetry/sdk-trace-web@1.24.0).
        const expectedRsEventNames =
          rsEventNames[1] === (PTN.UNLOAD_EVENT_START as string)
            ? [
                PTN.FETCH_START,
                PTN.UNLOAD_EVENT_START,
                PTN.UNLOAD_EVENT_END,
                PTN.DOM_INTERACTIVE,
                PTN.DOM_CONTENT_LOADED_EVENT_START,
                PTN.DOM_CONTENT_LOADED_EVENT_END,
                PTN.DOM_COMPLETE,
                PTN.LOAD_EVENT_START,
                PTN.LOAD_EVENT_END,
              ]
            : [
                PTN.FETCH_START,
                PTN.DOM_INTERACTIVE,
                PTN.DOM_CONTENT_LOADED_EVENT_START,
                PTN.DOM_CONTENT_LOADED_EVENT_END,
                PTN.DOM_COMPLETE,
                PTN.LOAD_EVENT_START,
                PTN.LOAD_EVENT_END,
              ];
        assert.deepStrictEqual(rsEventNames, expectedRsEventNames);

        assert.strictEqual(exporter.getFinishedSpans().length, 2);
        done();
      });
    });
  };

  describe('when fetchStart is negative still create spans', () => {
    const sandbox = sinon.createSandbox();
    beforeEach(() => {
      const navEntriesWithNegativeFetch = Object.assign({}, entries, {
        fetchStart: -1,
      }) as PerformanceNavigationTiming;
      sandbox
        .stub(window.performance, 'getEntriesByType')
        .withArgs('navigation')
        .returns([navEntriesWithNegativeFetch])
        .withArgs('resource')
        .returns([])
        .withArgs('paint')
        .returns([]);

      sandbox.stub(window.performance, 'timing').get(() => undefined);
    });
    afterEach(() => {
      sandbox.restore();
    });
    shouldExportCorrectSpan();
  });

  describe('add custom attributes to spans', () => {
    let spyEntries: SinonStubbedFunction<PerformanceEntry[]>;
    beforeEach(() => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns(resources);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should add attribute to document load span', (done) => {
      plugin = new DocumentLoadInstrumentation({
        enabled: false,
        applyCustomAttributesOnSpan: {
          documentLoad: (span) => {
            span.setAttribute('custom-key', 'custom-val');
          },
        },
      });
      plugin.enable();
      setTimeout(() => {
        const rootSpan = exporter.getFinishedSpans()[3];
        assert.strictEqual(rootSpan.attributes['custom-key'], 'custom-val');
        assert.strictEqual(exporter.getFinishedSpans().length, 4);
        done();
      });
    });

    it('should add attribute to document fetch span', (done) => {
      plugin = new DocumentLoadInstrumentation({
        enabled: false,
        applyCustomAttributesOnSpan: {
          documentFetch: (span) => {
            span.setAttribute('custom-key', 'custom-val');
          },
        },
      });
      plugin.enable();
      setTimeout(() => {
        const fetchSpan = exporter.getFinishedSpans()[0];
        assert.strictEqual(fetchSpan.attributes['custom-key'], 'custom-val');
        assert.strictEqual(exporter.getFinishedSpans().length, 4);
        done();
      });
    });

    it('should add attribute to resource fetch spans', (done) => {
      plugin = new DocumentLoadInstrumentation({
        enabled: false,
        applyCustomAttributesOnSpan: {
          resourceFetch: (span, resource) => {
            span.setAttribute('custom-key', 'custom-val');
            span.setAttribute(
              'resource.tcp.duration_ms',
              resource.connectEnd - resource.connectStart,
            );
          },
        },
      });
      plugin.enable();
      setTimeout(() => {
        const resourceSpan1 = exporter.getFinishedSpans()[1];
        const resourceSpan2 = exporter.getFinishedSpans()[2];
        assert.strictEqual(
          resourceSpan1.attributes['custom-key'],
          'custom-val',
        );
        assert.strictEqual(
          resourceSpan2.attributes['custom-key'],
          'custom-val',
        );
        assert.strictEqual(
          resourceSpan1.attributes['resource.tcp.duration_ms'],
          0,
        );
        assert.strictEqual(
          resourceSpan2.attributes['resource.tcp.duration_ms'],
          0,
        );
        assert.strictEqual(exporter.getFinishedSpans().length, 4);
        done();
      });
    });
    it('should still create the spans if the function throws error', (done) => {
      plugin = new DocumentLoadInstrumentation({
        enabled: false,
        applyCustomAttributesOnSpan: {
          documentLoad: (_span) => {
            throw new Error('test error');
          },
        },
      });
      plugin.enable();
      setTimeout(() => {
        assert.strictEqual(exporter.getFinishedSpans().length, 4);
        done();
      });
    });
  });

  describe('resource attributes and quality flags', () => {
    let spyEntries: SinonStubbedFunction<PerformanceEntry[]>;
    afterEach(() => {
      spyEntries.restore();
    });

    it('should capture extended PerformanceResourceTiming attributes', (done) => {
      const resourcesWithExtendedProps = [
        {
          ...resources[0],
          deliveryType: 'cache',
          renderBlockingStatus: 'blocking',
          responseStatus: 200,
        },
      ];
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns(resourcesWithExtendedProps);
      spyEntries.withArgs('paint').returns([]);

      plugin.enable();
      setTimeout(() => {
        const resourceSpan = exporter.getFinishedSpans()[1];
        assert.strictEqual(
          resourceSpan.attributes['http.response.delivery_type'],
          'cache',
        );
        assert.strictEqual(
          resourceSpan.attributes['http.request.render_blocking_status'],
          'blocking',
        );
        assert.strictEqual(
          resourceSpan.attributes['http.response.status_code'],
          200,
        );
        assert.strictEqual(
          resourceSpan.attributes['http.request.initiator_type'],
          'script',
        );
        assert.strictEqual(
          resourceSpan.attributes['http.response_content_length'],
          1446396,
        );
        assert.strictEqual(
          resourceSpan.attributes['http.response.size'],
          1446645,
        );
        assert.strictEqual(
          resourceSpan.attributes['http.response.decoded_body_size'],
          1446396,
        );
        done();
      });
    });

    it('should add http.response.cors_opaque attribute when resource has timing but no size data', (done) => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns([
        {
          ...resources[0],
          transferSize: 0,
          encodedBodySize: 0,
          decodedBodySize: 0,
          fetchStart: 20.985,
          responseEnd: 111.935,
        },
      ]);
      spyEntries.withArgs('paint').returns([]);

      plugin.enable();
      setTimeout(() => {
        const resourceSpan = exporter.getFinishedSpans()[1];
        assert.strictEqual(
          resourceSpan.attributes['http.response.cors_opaque'],
          true,
        );
        done();
      });
    });

    it('should add http.request.prevented attribute when request never started', (done) => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns([
        {
          ...resources[0],
          transferSize: 0,
          encodedBodySize: 0,
          decodedBodySize: 0,
          fetchStart: 0,
          responseEnd: 0,
        },
      ]);
      spyEntries.withArgs('paint').returns([]);

      plugin.enable();
      setTimeout(() => {
        const resourceSpan = exporter.getFinishedSpans()[1];
        assert.strictEqual(
          resourceSpan.attributes['http.request.prevented'],
          true,
        );
        done();
      });
    });

    it('should add http.request.incomplete attribute when request started but did not complete', (done) => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns([
        {
          ...resources[0],
          transferSize: 0,
          encodedBodySize: 0,
          decodedBodySize: 0,
          fetchStart: 20.985,
          responseEnd: 0,
        },
      ]);
      spyEntries.withArgs('paint').returns([]);

      plugin.enable();
      setTimeout(() => {
        const resourceSpan = exporter.getFinishedSpans()[1];
        assert.strictEqual(
          resourceSpan.attributes['http.request.incomplete'],
          true,
        );
        done();
      });
    });

    it('should add http.response.cache_revalidated attribute for 304 responses', (done) => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries
        .withArgs('resource')
        .returns([
          { ...resources[0], transferSize: 300, deliveryType: undefined },
        ]);
      spyEntries.withArgs('paint').returns([]);

      plugin.enable();
      setTimeout(() => {
        const resourceSpan = exporter.getFinishedSpans()[1];
        assert.strictEqual(
          resourceSpan.attributes['http.response.cache_revalidated'],
          true,
        );
        done();
      });
    });

    it('should not add http.response.cache_revalidated attribute when deliveryType is cache', (done) => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries
        .withArgs('resource')
        .returns([
          { ...resources[0], transferSize: 300, deliveryType: 'cache' },
        ]);
      spyEntries.withArgs('paint').returns([]);

      plugin.enable();
      setTimeout(() => {
        const resourceSpan = exporter.getFinishedSpans()[1];
        assert.isUndefined(
          resourceSpan.attributes['http.response.cache_revalidated'],
        );
        done();
      });
    });

    it('should not add diagnostic attributes for normal resources', (done) => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries
        .withArgs('resource')
        .returns([{ ...resources[0], responseStatus: 200 }]);
      spyEntries.withArgs('paint').returns([]);

      plugin.enable();
      setTimeout(() => {
        const resourceSpan = exporter.getFinishedSpans()[1];
        assert.isUndefined(
          resourceSpan.attributes['http.response.cors_opaque'],
        );
        assert.isUndefined(
          resourceSpan.attributes['http.response.cache_revalidated'],
        );
        assert.isUndefined(resourceSpan.attributes['http.request.incomplete']);
        assert.isUndefined(resourceSpan.attributes['http.request.prevented']);
        done();
      });
    });
  });

  describe('enable() idempotency', () => {
    let spyEntries: SinonStubbedFunction<PerformanceEntry[]>;
    beforeEach(() => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns([]);
      spyEntries.withArgs('paint').returns([]);
    });
    afterEach(() => {
      spyEntries.restore();
    });

    it('should not collect performance twice when disabled and re-enabled', (done) => {
      plugin = new DocumentLoadInstrumentation({ enabled: false });

      plugin.enable();
      plugin.disable();
      plugin.enable();

      setTimeout(() => {
        const finishedSpans = exporter.getFinishedSpans();
        const documentLoadSpans = finishedSpans.filter(
          (s) => s.name === 'documentLoad',
        );

        assert.strictEqual(documentLoadSpans.length, 1);
        done();
      }, 100);
    });
  });

  describe('ignore span events if specified', () => {
    let spyEntries: SinonStubbedFunction<PerformanceEntry[]>;
    beforeEach(() => {
      spyEntries = sandbox.stub(window.performance, 'getEntriesByType');
      spyEntries.withArgs('navigation').returns([entries]);
      spyEntries.withArgs('resource').returns(resources);
      spyEntries.withArgs('paint').returns(paintEntries);
    });

    afterEach(() => {
      spyEntries.restore();
    });

    it('should ignore network span events if ignoreNetworkEvents is set to true', (done) => {
      plugin = new DocumentLoadInstrumentation({
        enabled: false,
        ignoreNetworkEvents: true,
      });
      plugin.enable();

      setTimeout(() => {
        const rootSpan = exporter.getFinishedSpans()[0];
        const fetchSpan = exporter.getFinishedSpans()[1];
        const loadSpan = exporter.getFinishedSpans()[3];

        const rsEvents = rootSpan.events;
        const fsEvents = fetchSpan.events;
        const lsEvents = loadSpan.events;

        assert.strictEqual(exporter.getFinishedSpans().length, 4);
        assert.strictEqual(rootSpan.name, 'documentFetch');
        assert.strictEqual(rsEvents.length, 0);

        assert.strictEqual(fetchSpan.name, 'resourceFetch');
        assert.strictEqual(fsEvents.length, 0);

        assert.strictEqual(loadSpan.name, 'documentLoad');
        assert.deepEqual(
          lsEvents.map((event) => event.name),
          ['firstPaint', 'firstContentfulPaint'],
        );

        done();
      });
    });

    it('should ignore performance events if ignorePerformanceEvents is set to true', (done) => {
      plugin = new DocumentLoadInstrumentation({
        enabled: false,
        ignorePerformancePaintEvents: true,
      });
      plugin.enable();

      setTimeout(() => {
        const loadSpan = exporter.getFinishedSpans()[3];
        const lsEvents = loadSpan.events;

        assert.strictEqual(exporter.getFinishedSpans().length, 4);

        assert.strictEqual(loadSpan.name, 'documentLoad');
        assert.notInclude(
          lsEvents.map((event) => event.name),
          ['firstPaint', 'firstContentfulPaint'],
        );

        done();
      });
    });

    it('should have http.response_content_length attribute even if ignoreNetworkEvents is true', (done) => {
      plugin = new DocumentLoadInstrumentation({
        enabled: false,
        ignoreNetworkEvents: true,
      });
      plugin.enable();

      setTimeout(() => {
        const spans = exporter.getFinishedSpans();
        const resourceSpan = spans.find(
          (s) => s.name === 'resourceFetch',
        ) as ReadableSpan;
        assert.isOk(resourceSpan, 'resourceFetch span should exist');
        assert.exists(
          resourceSpan.attributes['http.response_content_length'],
          'http.response_content_length attribute should exist',
        );
        done();
      });
    });
  });
});

/**
 * Represents a timed event.
 * A timed event is an event with a timestamp.
 */
interface TimedEvent {
  time: HrTime;
  /** The name of the event. */
  name: string;
  /** The attributes of the event. */
  attributes?: Attributes;
}
