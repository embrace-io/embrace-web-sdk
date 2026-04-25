import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import type { SinonStub } from 'sinon';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { setupTestTraceExporter } from '../../../../tests/utils/index.ts';
import type { SessionPartManager } from '../../../api-sessions/index.ts';
import { session } from '../../../api-sessions/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSessionPartManager,
} from '../../../managers/index.ts';
import { EmbraceXHRInstrumentation } from './EmbraceXHRInstrumentation.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceXHRInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let sessionPartManager: SessionPartManager;
  let clock: sinon.SinonFakeTimers;
  let sendStub: SinonStub;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    sendStub = sinon.stub(window.XMLHttpRequest.prototype, 'send');
    clock = sinon.useFakeTimers();
    memoryExporter.reset();
    sessionPartManager = new EmbraceSessionPartManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });
    session.setGlobalManagers(sessionPartManager);
  });

  afterEach(() => {
    clock.restore();
    sendStub.restore();
  });

  it('should emit telemetry for requests made through `XMLHttpRequest`', () => {
    new EmbraceXHRInstrumentation({ enabled: true });

    const req = new XMLHttpRequest();
    req.open('GET', 'something', true);
    req.send();
    req.dispatchEvent(new ProgressEvent('load'));

    // Advance the clock since the XHR instrumentation has this additional wait:
    // https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.203.0/experimental/packages/opentelemetry-instrumentation-xml-http-request/src/xhr.ts#L72C7-L72C28
    clock.tick(1000);
    sessionPartManager.endSessionPart();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const fetchSpan = finishedSpans[0];

    expect(fetchSpan.attributes).to.deep.equal({
      'http.host': fetchSpan.attributes['http.host'],
      'http.method': 'GET',
      'http.scheme': fetchSpan.attributes['http.scheme'],
      'http.status_code': 0,
      'http.status_text': '',
      'http.url': `${fetchSpan.attributes['http.scheme']}://${fetchSpan.attributes['http.host']}/something`,
      'http.user_agent': fetchSpan.attributes['http.user_agent'],
    });
  });

  it('should re-patch `xhr` by default if a previous instrumentation had patched it already', () => {
    new EmbraceXHRInstrumentation({
      enabled: true,
      applyCustomAttributesOnSpan: (span) =>
        span.setAttribute('first-instrumentation', true),
    });

    new EmbraceXHRInstrumentation({
      enabled: true,
      applyCustomAttributesOnSpan: (span) =>
        span.setAttribute('second-instrumentation', true),
    });

    const req = new XMLHttpRequest();
    req.open('GET', 'something', true);
    req.send();
    req.dispatchEvent(new ProgressEvent('load'));

    // Advance the clock since the XHR instrumentation has this additional wait:
    // https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.203.0/experimental/packages/opentelemetry-instrumentation-xml-http-request/src/xhr.ts#L72C7-L72C28
    clock.tick(1000);
    sessionPartManager.endSessionPart();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const fetchSpan = finishedSpans[0];

    expect(fetchSpan.attributes).to.deep.equal({
      'http.host': fetchSpan.attributes['http.host'],
      'http.method': 'GET',
      'http.scheme': fetchSpan.attributes['http.scheme'],
      'http.status_code': 0,
      'http.status_text': '',
      'http.url': `${fetchSpan.attributes['http.scheme']}://${fetchSpan.attributes['http.host']}/something`,
      'http.user_agent': fetchSpan.attributes['http.user_agent'],

      // The second instrumentation should win in this case since it was the last one to patch `fetch` it will remove
      // all previous patches
      'second-instrumentation': true,
    });
  });

  it('should allow not re-patching `xhr` if a previous instrumentation had patched it already', () => {
    new EmbraceXHRInstrumentation({
      enabled: true,
      applyCustomAttributesOnSpan: (span) =>
        span.setAttribute('first-instrumentation', true),
    });

    new EmbraceXHRInstrumentation({
      enabled: true,
      omitIfAlreadyPatched: true,
      applyCustomAttributesOnSpan: (span) =>
        span.setAttribute('second-instrumentation', true),
    });

    const req = new XMLHttpRequest();
    req.open('GET', 'something', true);
    req.send();
    req.dispatchEvent(new ProgressEvent('load'));

    // Advance the clock since the XHR instrumentation has this additional wait:
    // https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.203.0/experimental/packages/opentelemetry-instrumentation-xml-http-request/src/xhr.ts#L72C7-L72C28
    clock.tick(1000);
    sessionPartManager.endSessionPart();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const fetchSpan = finishedSpans[0];

    expect(fetchSpan.attributes).to.deep.equal({
      'http.host': fetchSpan.attributes['http.host'],
      'http.method': 'GET',
      'http.scheme': fetchSpan.attributes['http.scheme'],
      'http.status_code': 0,
      'http.status_text': '',
      'http.url': `${fetchSpan.attributes['http.scheme']}://${fetchSpan.attributes['http.host']}/something`,
      'http.user_agent': fetchSpan.attributes['http.user_agent'],

      // The first instrumentation should win in this case since the second one was told not to re-patch
      'first-instrumentation': true,
    });
  });
});
