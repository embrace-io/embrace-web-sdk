import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import {
  fakeFetchInstall,
  fakeFetchRestore,
  setupTestTraceExporter,
} from '../../../testUtils/index.js';
import { EmbraceFetchInstrumentation } from './EmbraceFetchInstrumentation.js';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSpanSessionManager,
} from '../../../managers/index.js';
import { session } from '../../../api-sessions/index.js';
import type { SpanSessionManager } from '../../../api-sessions/index.js';
import * as sinon from 'sinon';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceFetchInstrumentation', () => {
  let memoryExporter: InMemorySpanExporter;
  let spanSessionManager: SpanSessionManager;
  let clock: sinon.SinonFakeTimers;

  before(() => {
    memoryExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    fakeFetchInstall();
    clock = sinon.useFakeTimers();
    memoryExporter.reset();
    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });
    session.setGlobalSessionManager(spanSessionManager);
  });

  afterEach(() => {
    fakeFetchRestore();
    clock.restore();
  });

  it('should emit telemetry for requests made through `fetch`', async () => {
    new EmbraceFetchInstrumentation({ enabled: true });

    await fetch('something');
    // Advance the clock since the fetch instrumentation has this additional wait:
    // https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.203.0/experimental/packages/opentelemetry-instrumentation-fetch/src/fetch.ts#L61
    clock.tick(1000);
    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const fetchSpan = finishedSpans[0];

    expect(fetchSpan.attributes).to.deep.equal({
      component: 'fetch',
      'http.host': fetchSpan.attributes['http.host'],
      'http.method': 'GET',
      'http.scheme': fetchSpan.attributes['http.scheme'],
      'http.status_code': 200,
      'http.status_text': '',
      'http.url': `${fetchSpan.attributes['http.scheme']}://${fetchSpan.attributes['http.host']}/something`,
      'http.user_agent': fetchSpan.attributes['http.user_agent'],
    });
  });

  it('should re-patch `fetch` by default if a previous instrumentation had patched it already', async () => {
    new EmbraceFetchInstrumentation({
      enabled: true,
      applyCustomAttributesOnSpan: span =>
        span.setAttribute('first-instrumentation', true),
    });

    new EmbraceFetchInstrumentation({
      enabled: true,
      applyCustomAttributesOnSpan: span =>
        span.setAttribute('second-instrumentation', true),
    });

    await fetch('something');
    // Advance the clock since the fetch instrumentation has this additional wait:
    // https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.203.0/experimental/packages/opentelemetry-instrumentation-fetch/src/fetch.ts#L61
    clock.tick(1000);
    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const fetchSpan = finishedSpans[0];

    expect(fetchSpan.attributes).to.deep.equal({
      component: 'fetch',
      'http.host': fetchSpan.attributes['http.host'],
      'http.method': 'GET',
      'http.scheme': fetchSpan.attributes['http.scheme'],
      'http.status_code': 200,
      'http.status_text': '',
      'http.url': `${fetchSpan.attributes['http.scheme']}://${fetchSpan.attributes['http.host']}/something`,
      'http.user_agent': fetchSpan.attributes['http.user_agent'],

      // The second instrumentation should win in this case since it was the last one to patch `fetch` it will remove
      // all previous patches
      'second-instrumentation': true,
    });
  });

  it('should allow not re-patching `fetch` if a previous instrumentation had patched it already', async () => {
    new EmbraceFetchInstrumentation({
      enabled: true,
      applyCustomAttributesOnSpan: span =>
        span.setAttribute('first-instrumentation', true),
    });

    new EmbraceFetchInstrumentation({
      enabled: true,
      omitIfAlreadyPatched: true,
      applyCustomAttributesOnSpan: span =>
        span.setAttribute('second-instrumentation', true),
    });

    await fetch('something');
    // Advance the clock since the fetch instrumentation has this additional wait:
    // https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.203.0/experimental/packages/opentelemetry-instrumentation-fetch/src/fetch.ts#L61
    clock.tick(1000);
    spanSessionManager.endSessionSpan();

    const finishedSpans = memoryExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const fetchSpan = finishedSpans[0];

    expect(fetchSpan.attributes).to.deep.equal({
      component: 'fetch',
      'http.host': fetchSpan.attributes['http.host'],
      'http.method': 'GET',
      'http.scheme': fetchSpan.attributes['http.scheme'],
      'http.status_code': 200,
      'http.status_text': '',
      'http.url': `${fetchSpan.attributes['http.scheme']}://${fetchSpan.attributes['http.host']}/something`,
      'http.user_agent': fetchSpan.attributes['http.user_agent'],

      // The first instrumentation should win in this case since the second one was told not to re-patch
      'first-instrumentation': true,
    });
  });
});
