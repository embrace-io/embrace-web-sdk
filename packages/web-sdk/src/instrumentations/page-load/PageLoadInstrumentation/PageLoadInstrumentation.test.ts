import { SeverityNumber } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  InMemoryDiagLogger,
  MockPerformanceManager,
  setupTestLogExporter,
} from '../../../../tests/utils/index.ts';
import { EmbracePageManager } from '../../../managers/index.ts';
import { OTelPerformanceManager } from '../../../utils/index.ts';
import { PageLoadInstrumentation } from './PageLoadInstrumentation.ts';
import type { PageLoadInstrumentationArgs } from './types.ts';

const { expect } = chai;

type ObserverCallback = (list: {
  getEntries: () => PerformanceEntry[];
}) => void;

let resourceObserverCallback: ObserverCallback | null = null;

class MockPerformanceObserver {
  public static supportedEntryTypes = ['resource'];
  private readonly _callback: ObserverCallback;

  public constructor(callback: ObserverCallback) {
    this._callback = callback;
  }

  public observe(): void {
    resourceObserverCallback = this._callback;
  }

  public disconnect(): void {
    if (resourceObserverCallback === this._callback) {
      resourceObserverCallback = null;
    }
  }
}

const reportResource = (initiatorType: string) => {
  resourceObserverCallback?.({
    getEntries: () => [{ initiatorType } as PerformanceResourceTiming],
  });
};

const deferResponse = () => {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, respond: () => resolve(new Response()) };
};

describe('PageLoadInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let clock: sinon.SinonFakeTimers;
  let perf: OTelPerformanceManager;
  let diag: InMemoryDiagLogger;
  let pageManager: EmbracePageManager;
  let fetchStub: sinon.SinonStub;
  let instrumentation: PageLoadInstrumentation;
  let originalPerformanceObserver: typeof globalThis.PerformanceObserver;

  const createInstrumentation = (
    args: Partial<PageLoadInstrumentationArgs> = {},
  ) => {
    instrumentation = new PageLoadInstrumentation({
      diag,
      perf,
      pageManager,
      ...args,
    });

    return instrumentation;
  };

  const getLogs = () =>
    memoryExporter
      .getFinishedLogRecords()
      .filter((l) => l.eventName === 'page-load');

  before(() => {
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);
    diag = new InMemoryDiagLogger();
    pageManager = new EmbracePageManager({
      navigationHost: {
        location: { href: 'http://example.com/home', pathname: '/home' },
      },
    });
    fetchStub = sinon.stub(window, 'fetch');

    originalPerformanceObserver = globalThis.PerformanceObserver;
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      MockPerformanceObserver;
    resourceObserverCallback = null;
  });

  afterEach(() => {
    instrumentation.disable();
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      originalPerformanceObserver;
    clock.restore();
    sinon.restore();
  });

  describe('initial load', () => {
    it('emits a log once no request is in flight for the quiet window', async () => {
      const response = deferResponse();
      fetchStub.returns(response.promise);
      createInstrumentation().enable();

      clock.tick(50);
      void window.fetch('/api/products');
      clock.tick(300);
      response.respond();
      await Promise.resolve();

      clock.tick(99);
      expect(getLogs()).to.have.lengthOf(0);

      clock.tick(1);
      const logs = getLogs();
      expect(logs).to.have.lengthOf(1);
      expect(logs[0].severityNumber).to.equal(SeverityNumber.INFO);
      expect(logs[0].attributes).to.deep.equal({
        'emb.type': 'emb.otel_log',
        'page_load.type': 'initial_load',
        'page_load.duration': 350,
      });
      // The time the page went quiet, not the end of the quiet window.
      expect(logs[0].hrTime).to.deep.equal([0, 350_000_000]);
    });

    it('waits for the load event', () => {
      const navigationEntry = { loadEventEnd: 0, activationStart: 0 };
      perf = new OTelPerformanceManager({
        now: () => clock.now,
        timeOrigin: 0,
        getEntriesByType: (type) =>
          type === 'navigation'
            ? [navigationEntry as unknown as PerformanceEntry]
            : [],
      });
      Object.defineProperty(document, 'readyState', {
        configurable: true,
        get: () => 'loading',
      });

      try {
        createInstrumentation().enable();
        clock.tick(400);
        expect(getLogs()).to.have.lengthOf(0);

        navigationEntry.loadEventEnd = 400;
        window.dispatchEvent(new Event('load'));
      } finally {
        Reflect.deleteProperty(document, 'readyState');
      }
      clock.tick(0);

      const logs = getLogs();
      expect(logs).to.have.lengthOf(1);
      expect(logs[0].attributes).to.include({
        'page_load.type': 'initial_load',
        'page_load.duration': 400,
      });
    });

    it('measures a prerendered page from its activation', () => {
      perf = new OTelPerformanceManager({
        now: () => clock.now,
        timeOrigin: 0,
        getEntriesByType: (type) =>
          type === 'navigation'
            ? [
                {
                  loadEventEnd: 100,
                  activationStart: 200,
                } as unknown as PerformanceEntry,
              ]
            : [],
      });
      clock.tick(250);
      createInstrumentation().enable();

      clock.tick(100);

      expect(getLogs()[0].attributes).to.include({
        'page_load.duration': 50,
      });
    });

    it('restarts the quiet window on a DOM mutation', async () => {
      createInstrumentation().enable();
      const element = document.createElement('div');

      try {
        clock.tick(50);
        document.body.append(element);
        await Promise.resolve();

        clock.tick(99);
        expect(getLogs()).to.have.lengthOf(0);
        clock.tick(1);
      } finally {
        element.remove();
      }

      expect(getLogs()[0].attributes).to.include({
        'page_load.duration': 50,
      });
    });

    it('restarts the quiet window on a resource load', () => {
      createInstrumentation().enable();

      clock.tick(50);
      reportResource('img');
      clock.tick(100);

      expect(getLogs()[0].attributes).to.include({
        'page_load.duration': 50,
      });
    });

    it('leaves fetch and XHR resource entries to the request tracking', () => {
      createInstrumentation().enable();

      clock.tick(50);
      reportResource('fetch');
      reportResource('xmlhttprequest');
      clock.tick(50);

      expect(getLogs()[0].attributes).to.include({
        'page_load.duration': 0,
      });
    });

    it('does not measure the initial load again when re-enabled', () => {
      createInstrumentation().enable();
      clock.tick(100);
      instrumentation.disable();
      instrumentation.enable();
      clock.tick(1000);

      expect(getLogs()).to.have.lengthOf(1);
    });
  });

  describe('route changes', () => {
    it('measures each route change from when it was reported', async () => {
      const response = deferResponse();
      fetchStub.returns(response.promise);
      createInstrumentation().enable();
      clock.tick(1000);

      pageManager.setCurrentRoute({ url: '/products' });
      clock.tick(50);
      void window.fetch('/api/products');
      clock.tick(200);
      response.respond();
      await Promise.resolve();
      clock.tick(100);

      const logs = getLogs();
      expect(logs).to.have.lengthOf(2);
      expect(logs[1].attributes).to.deep.equal({
        'emb.type': 'emb.otel_log',
        'page_load.type': 'route_change',
        'page_load.duration': 250,
      });
      expect(logs[1].hrTime).to.deep.equal([1, 250_000_000]);
    });

    it('does not start a view when the same page is reported again', () => {
      createInstrumentation().enable();
      clock.tick(100);

      pageManager.setCurrentRoute({ url: '/home', path: '/:section' });
      clock.tick(1000);

      expect(getLogs()).to.have.lengthOf(1);
    });

    it('abandons a view still loading when the route changes', async () => {
      const response = deferResponse();
      fetchStub.returns(response.promise);
      createInstrumentation().enable();

      void window.fetch('/api/slow');
      clock.tick(500);
      pageManager.setCurrentRoute({ url: '/products' });
      clock.tick(100);
      response.respond();
      await Promise.resolve();
      clock.tick(100);

      const logs = getLogs();
      expect(logs).to.have.lengthOf(1);
      expect(logs[0].attributes).to.include({
        'page_load.type': 'route_change',
        'page_load.duration': 100,
      });
    });

    it('stops listening for route changes once disabled', () => {
      createInstrumentation().enable();
      clock.tick(100);
      instrumentation.disable();

      pageManager.setCurrentRoute({ url: '/products' });
      clock.tick(1000);

      expect(getLogs()).to.have.lengthOf(1);
    });
  });

  describe('requests', () => {
    it('tracks XHR requests until they end', () => {
      sinon.stub(XMLHttpRequest.prototype, 'send');
      createInstrumentation().enable();

      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/products');
      xhr.send();
      clock.tick(300);
      expect(getLogs()).to.have.lengthOf(0);

      xhr.dispatchEvent(new ProgressEvent('loadend'));
      clock.tick(100);

      expect(getLogs()[0].attributes).to.include({
        'page_load.duration': 300,
      });
    });

    it('ends an XHR request reopened while in flight', () => {
      sinon.stub(XMLHttpRequest.prototype, 'send');
      createInstrumentation().enable();

      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/products');
      xhr.send();
      clock.tick(300);
      // The browser cancels the request without firing loadend.
      xhr.open('GET', '/api/products');
      clock.tick(100);

      expect(getLogs()[0].attributes).to.include({
        'page_load.duration': 300,
      });
    });

    it('keeps an XHR request in flight when it is sent again', () => {
      const send = sinon.stub(XMLHttpRequest.prototype, 'send');
      createInstrumentation().enable();

      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/products');
      xhr.send();
      send.throws(new DOMException('already sent', 'InvalidStateError'));
      expect(() => xhr.send()).to.throw();
      clock.tick(300);
      expect(getLogs()).to.have.lengthOf(0);

      xhr.dispatchEvent(new ProgressEvent('loadend'));
      clock.tick(100);
      expect(getLogs()).to.have.lengthOf(1);

      // A miscounted request would leave the next one unable to hold a view.
      send.resetBehavior();
      pageManager.setCurrentRoute({ url: '/next' });
      const next = new XMLHttpRequest();
      next.open('GET', '/api/next');
      next.send();
      clock.tick(300);
      expect(getLogs()).to.have.lengthOf(1);
    });

    it('counts a failed synchronous XHR as ended once', () => {
      const send = sinon
        .stub(XMLHttpRequest.prototype, 'send')
        .callsFake(function (this: XMLHttpRequest) {
          // Firefox and WebKit fire loadend before the synchronous send throws.
          this.dispatchEvent(new ProgressEvent('loadend'));
          throw new DOMException('network error', 'NetworkError');
        });
      createInstrumentation().enable();

      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/products', false);
      expect(() => xhr.send()).to.throw();
      clock.tick(100);
      expect(getLogs()).to.have.lengthOf(1);

      // A double count would leave the next request unable to hold a view.
      send.resetBehavior();
      pageManager.setCurrentRoute({ url: '/next' });
      const next = new XMLHttpRequest();
      next.open('GET', '/api/next');
      next.send();
      clock.tick(300);
      expect(getLogs()).to.have.lengthOf(1);
    });

    it('ends an XHR request sent twice once it is reopened', () => {
      const send = sinon.stub(XMLHttpRequest.prototype, 'send');
      createInstrumentation().enable();

      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/products');
      xhr.send();
      send.throws(new DOMException('already sent', 'InvalidStateError'));
      expect(() => xhr.send()).to.throw();
      clock.tick(300);
      xhr.open('GET', '/api/products');
      clock.tick(100);

      expect(getLogs()).to.have.lengthOf(1);
    });

    it('keeps an XHR request in flight when reopening it throws', () => {
      sinon.stub(XMLHttpRequest.prototype, 'send');
      createInstrumentation().enable();

      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/products');
      xhr.send();
      expect(() => xhr.open('GET', 'http://[invalid')).to.throw();
      clock.tick(300);
      expect(getLogs()).to.have.lengthOf(0);

      xhr.dispatchEvent(new ProgressEvent('loadend'));
      clock.tick(100);
      expect(getLogs()).to.have.lengthOf(1);
    });

    it('tracks a request retried from a loadend listener', () => {
      sinon.stub(XMLHttpRequest.prototype, 'send');
      createInstrumentation().enable();

      const xhr = new XMLHttpRequest();
      let retried = false;
      xhr.addEventListener('loadend', () => {
        if (!retried) {
          retried = true;
          xhr.open('GET', '/api/products');
          xhr.send();
        }
      });
      xhr.open('GET', '/api/products');
      xhr.send();
      clock.tick(100);
      xhr.dispatchEvent(new ProgressEvent('loadend'));
      clock.tick(300);
      expect(getLogs()).to.have.lengthOf(0);

      xhr.dispatchEvent(new ProgressEvent('loadend'));
      clock.tick(100);
      expect(getLogs()[0].attributes).to.include({
        'page_load.duration': 400,
      });
    });

    it('ends a fetch that rejects', async () => {
      const response = Promise.reject(new TypeError('Failed to fetch'));
      response.catch(() => undefined);
      fetchStub.returns(response);
      createInstrumentation().enable();

      clock.tick(50);
      void window.fetch('/api/products').catch(() => undefined);
      await Promise.resolve();
      clock.tick(100);

      expect(getLogs()[0].attributes).to.include({
        'page_load.duration': 50,
      });
    });

    it('returns the original fetch promise to the caller', () => {
      const response = deferResponse();
      fetchStub.returns(response.promise);
      createInstrumentation().enable();

      expect(window.fetch('/api/products')).to.equal(response.promise);
    });

    it('leaves out requests matching ignoreUrls', () => {
      fetchStub.returns(new Promise(() => undefined));
      createInstrumentation({
        ignoreUrls: [/\/stream$/, `${window.location.origin}/poll`],
      }).enable();

      void window.fetch('/stream');
      void window.fetch('/poll');
      clock.tick(100);

      expect(getLogs()).to.have.lengthOf(1);
    });

    it('resolves ignoreUrls strings before matching them', () => {
      fetchStub.returns(new Promise(() => undefined));
      createInstrumentation({
        ignoreUrls: [
          '/poll',
          `HTTP://${window.location.host.toUpperCase()}/feed`,
        ],
      }).enable();

      void window.fetch(`${window.location.origin}/poll`);
      void window.fetch('/feed');
      clock.tick(100);

      expect(getLogs()).to.have.lengthOf(1);
    });

    it('restores fetch and XHR when disabled', () => {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      createInstrumentation().enable();
      expect(window.fetch).to.not.equal(fetchStub);

      instrumentation.disable();

      expect(window.fetch).to.equal(fetchStub);
      expect(XMLHttpRequest.prototype.open).to.equal(originalOpen);
      expect(XMLHttpRequest.prototype.send).to.equal(originalSend);
    });

    it('keeps a patch another wrapper went on top of, and does not wrap twice on re-enable', () => {
      createInstrumentation().enable();
      const patchedFetch = window.fetch;
      const outerFetch = (...args: Parameters<typeof fetch>) =>
        patchedFetch(...args);
      window.fetch = outerFetch;

      instrumentation.disable();
      expect(window.fetch).to.equal(outerFetch);

      instrumentation.enable();
      expect(window.fetch).to.equal(outerFetch);
    });
  });

  describe('applyCustomAttributesOnLog', () => {
    it('adds the returned attributes, keeping the ones the instrumentation sets', () => {
      const applyCustomAttributesOnLog = sinon.stub().returns({
        'app.release_channel': 'beta',
        'page_load.type': 'overridden',
      });
      createInstrumentation({ applyCustomAttributesOnLog }).enable();
      clock.tick(100);

      sinon.assert.calledOnceWithExactly(applyCustomAttributesOnLog, {
        type: 'initial_load',
        duration: 0,
      });
      expect(getLogs()[0].attributes).to.deep.equal({
        'emb.type': 'emb.otel_log',
        'page_load.type': 'initial_load',
        'page_load.duration': 0,
        'app.release_channel': 'beta',
      });
    });

    it('still emits the log when the hook throws', () => {
      createInstrumentation({
        applyCustomAttributesOnLog: () => {
          throw new Error('hook failed');
        },
      }).enable();
      clock.tick(100);

      expect(getLogs()).to.have.lengthOf(1);
      expect(diag.getErrorLogs()).to.include(
        'applyCustomAttributesOnLog hook failed',
      );
    });
  });
});
