import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { session } from '../../../api-sessions/index.js';
import type { SpanSessionManager } from '../../../api-sessions/index.js';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSpanSessionManager,
} from '../../../managers/index.js';
import {
  InMemoryDiagLogger,
  setupTestTraceExporter,
  setupPerformanceObserverTester,
} from '../../../testUtils/index.js';
import { NetworkInstrumentation } from './NetworkInstrumentation.js';

chai.use(sinonChai);
const { expect } = chai;

const FETCH_SUCCESS_ENTRY = {
  name: 'https://pokeapi.co/api/v2/pokemon/1/',
  entryType: 'resource',
  startTime: 1182839.5,
  duration: 20030,
  initiatorType: 'fetch',
  deliveryType: '',
  nextHopProtocol: 'http/1.1',
  renderBlockingStatus: 'non-blocking',
  workerStart: 0,
  redirectStart: 0,
  redirectEnd: 0,
  fetchStart: 1182839.5,
  domainLookupStart: 1202844.8000000007,
  domainLookupEnd: 1202844.8000000007,
  connectStart: 1202844.8000000007,
  secureConnectionStart: 0,
  connectEnd: 1202844.8000000007,
  requestStart: 1202844.9000000004,
  responseStart: 1202853.5,
  firstInterimResponseStart: 0,
  finalResponseHeadersStart: 1202853.5,
  responseEnd: 1202869.5,
  transferSize: 139681,
  encodedBodySize: 139381,
  decodedBodySize: 453190,
  responseStatus: 200,
  serverTiming: [],
  toJSON: sinon.stub(),
};

const XML_HTTP_REQUEST_SUCCESS_ENTRY = {
  name: 'https://pokeapi.co/api/v2/pokemon/1/',
  entryType: 'resource',
  startTime: 1182839.5,
  duration: 20030,
  initiatorType: 'xmlhttprequest',
  deliveryType: '',
  nextHopProtocol: 'http/1.1',
  renderBlockingStatus: 'non-blocking',
  workerStart: 0,
  redirectStart: 0,
  redirectEnd: 0,
  fetchStart: 1182839.5,
  domainLookupStart: 1202844.8000000007,
  domainLookupEnd: 1202844.8000000007,
  connectStart: 1202844.8000000007,
  secureConnectionStart: 0,
  connectEnd: 1202844.8000000007,
  requestStart: 1202844.9000000004,
  responseStart: 1202853.5,
  firstInterimResponseStart: 0,
  finalResponseHeadersStart: 1202853.5,
  responseEnd: 1202869.5,
  transferSize: 139681,
  encodedBodySize: 139381,
  decodedBodySize: 453190,
  responseStatus: 200,
  serverTiming: [],
  toJSON: sinon.stub(),
};

const FETCH_404_ENTRY = {
  name: 'https://pokeapi.co/api/v2/pokemon/foo/',
  entryType: 'resource',
  startTime: 1649386.3999999985,
  duration: 11.300000000745058,
  initiatorType: 'fetch',
  deliveryType: '',
  nextHopProtocol: 'http/1.0',
  renderBlockingStatus: 'non-blocking',
  workerStart: 0,
  redirectStart: 0,
  redirectEnd: 0,
  fetchStart: 1649386.3999999985,
  domainLookupStart: 1649388.1999999993,
  domainLookupEnd: 1649388.1999999993,
  connectStart: 1649388.1999999993,
  secureConnectionStart: 0,
  connectEnd: 1649388.5,
  requestStart: 1649388.5,
  responseStart: 1649396.8999999985,
  firstInterimResponseStart: 0,
  finalResponseHeadersStart: 1649396.8999999985,
  responseEnd: 1649397.6999999993,
  transferSize: 635,
  encodedBodySize: 335,
  decodedBodySize: 335,
  responseStatus: 404,
  serverTiming: [],
  toJSON: sinon.stub(),
};

describe('NetworkInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let instrumentation: NetworkInstrumentation;
  let diag: InMemoryDiagLogger;
  let spanSessionManager: SpanSessionManager;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    diag = new InMemoryDiagLogger();
    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });
    session.setGlobalSessionManager(spanSessionManager);
    spanSessionManager.startSessionSpan();
  });

  afterEach(() => {
    instrumentation.disable();
  });

  it('should observe resource entries', () => {
    const performanceObserverTester = setupPerformanceObserverTester();
    instrumentation = new NetworkInstrumentation({
      diag,
      performanceObserverBuilder: performanceObserverTester.builder,
    });

    void expect(
      performanceObserverTester.observerStub.observe.calledWith({
        type: 'resource',
        buffered: true,
      })
    ).to.be.true;
  });

  it('should add spans for observed performance resource timing entries', () => {
    const performanceObserverTester = setupPerformanceObserverTester();

    instrumentation = new NetworkInstrumentation({
      diag,
      performanceObserverBuilder: performanceObserverTester.builder,
    });

    expect(
      performanceObserverTester.invokeCallback([
        FETCH_SUCCESS_ENTRY,
        XML_HTTP_REQUEST_SUCCESS_ENTRY,
        FETCH_404_ENTRY,
      ])
    ).to.equal(true);

    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(4);

    expect(finishedSpans[0].attributes).to.deep.equal({
      'http.request.body.size': 0,
      'http.request.method': 'GET',
      'http.response.body.size': 453190,
      'http.response.status_code': 200,
      'url.full': 'https://pokeapi.co/api/v2/pokemon/1/',
    });

    expect(finishedSpans[1].attributes).to.deep.equal({
      'http.request.body.size': 0,
      'http.request.method': 'GET',
      'http.response.body.size': 453190,
      'http.response.status_code': 200,
      'url.full': 'https://pokeapi.co/api/v2/pokemon/1/',
    });

    expect(finishedSpans[2].attributes).to.deep.equal({
      'error.message': 'not found',
      'error.type': 'not found',
      'http.request.body.size': 0,
      'http.request.method': 'GET',
      'http.response.body.size': 335,
      'http.response.status_code': 404,
      'url.full': 'https://pokeapi.co/api/v2/pokemon/foo/',
    });
  });
});
