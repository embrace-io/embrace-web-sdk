import { SeverityNumber } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  MockPerformanceManager,
  setupTestLogExporter,
  setupTestStorage,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../../tests/utils/index.ts';
import { log } from '../../../api-logs/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceLogManager,
  EmbraceUserSessionManager,
} from '../../../managers/index.ts';
import { ServerTimingInstrumentation } from './ServerTimingInstrumentation.ts';

const { expect } = chai;

const makeServerTimingEntry = (
  overrides: Partial<PerformanceServerTiming> = {},
): PerformanceServerTiming => ({
  name: 'db',
  duration: 78,
  description: '',
  toJSON: () => ({}),
  ...overrides,
});

const makeNavigationEntry = (
  serverTiming: PerformanceServerTiming[],
): PerformanceNavigationTiming =>
  ({ serverTiming }) as unknown as PerformanceNavigationTiming;

/*
 * Stands in for PerformanceObserver so tests control when the navigation entry
 * arrives. Engines replay a buffered entry in a later task, never inside
 * observe(), which is what keeps the read out of the constructor.
 */
class FakePerformanceObserver {
  public static supportedEntryTypes: string[] = ['navigation'];
  public static instances: FakePerformanceObserver[] = [];

  public observedOptions: PerformanceObserverInit | null = null;
  public isDisconnected = false;
  private readonly _callback: PerformanceObserverCallback;

  public constructor(callback: PerformanceObserverCallback) {
    this._callback = callback;
    FakePerformanceObserver.instances.push(this);
  }

  public static latest(): FakePerformanceObserver {
    const observer =
      FakePerformanceObserver.instances[
        FakePerformanceObserver.instances.length - 1
      ];
    expect(observer, 'expected an observer to have been created').to.be.ok;
    return observer;
  }

  public observe(options: PerformanceObserverInit): void {
    this.observedOptions = options;
    const [entry] = window.performance.getEntriesByType('navigation');

    if (options.buffered && entry) {
      setTimeout(() => {
        if (this.isDisconnected) {
          return;
        }
        this._callback(
          {
            getEntries: () => [entry],
          } as unknown as PerformanceObserverEntryList,
          this as unknown as PerformanceObserver,
        );
      }, 0);
    }
  }

  public disconnect(): void {
    this.isDisconnected = true;
  }

  public takeRecords(): PerformanceEntryList {
    return [];
  }
}

describe('ServerTimingInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let perf: MockPerformanceManager;
  let clock: sinon.SinonFakeTimers;
  let getEntriesByTypeStub: sinon.SinonStub;
  let addEventListenerSpy: sinon.SinonSpy;
  let limitManager: EmbraceLimitManager;
  let realPerformanceObserver: typeof globalThis.PerformanceObserver;

  before(() => {
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    clock = sinon.useFakeTimers();
    perf = new MockPerformanceManager(clock);

    limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);
    const storage = setupTestStorage();
    const userSessionManager = new EmbraceUserSessionManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      limitManager,
      perf,
      storage,
      visibilityDoc: window.document,
    });
    userSessionManager.startSessionPartInternal({ reason: 'init' });
    const logManager = new EmbraceLogManager({
      userSessionManager,
      limitManager,
      perf,
      storage,
      visibilityDoc: window.document,
    });
    log.setGlobalLogManager(logManager);

    // Install a standalone stub directly via Object.defineProperty — avoids sinon.stub(object, method)
    // which calls object.hasOwnProperty(), unavailable on host objects in some Chromium builds.
    getEntriesByTypeStub = sinon.stub();
    Object.defineProperty(window.performance, 'getEntriesByType', {
      value: getEntriesByTypeStub,
      writable: true,
      configurable: true,
    });
    addEventListenerSpy = sinon.spy(window, 'addEventListener');

    realPerformanceObserver = globalThis.PerformanceObserver;
    FakePerformanceObserver.instances = [];
    FakePerformanceObserver.supportedEntryTypes = ['navigation'];
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      FakePerformanceObserver;

    Object.defineProperty(window.document, 'readyState', {
      writable: true,
      value: 'complete',
    });
  });

  /* Lets the queued buffered replay run. */
  const deliverNavigationEntry = () => clock.tick(0);

  afterEach(() => {
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      realPerformanceObserver;
    sinon.restore();
    Object.defineProperty(window.performance, 'getEntriesByType', {
      value: Performance.prototype.getEntriesByType,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.document, 'readyState', {
      writable: true,
      value: 'complete',
    });
  });

  describe('collecting server timings', () => {
    it('emits one log per server timing entry', () => {
      getEntriesByTypeStub.withArgs('navigation').returns([
        makeNavigationEntry([
          makeServerTimingEntry({ name: 'db', duration: 78, description: '' }),
          makeServerTimingEntry({
            name: 'cache',
            duration: 0,
            description: 'HIT',
          }),
        ]),
      ]);

      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager,
      });
      deliverNavigationEntry();

      const logs = memoryExporter.getFinishedLogRecords();
      expect(logs).to.have.length(2);

      expect(logs[0].eventName).to.equal('emb-server-timing');
      expect(logs[0].severityNumber).to.equal(SeverityNumber.INFO);
      expect(logs[0].attributes['emb.type']).to.equal('ux.server_timing');
      expect(logs[0].attributes['emb.server_timing.name']).to.equal('db');
      expect(logs[0].attributes['emb.server_timing.duration']).to.equal(78);
      expect(logs[0].attributes['emb.server_timing.description']).to.equal('');

      expect(logs[1].attributes['emb.server_timing.name']).to.equal('cache');
      expect(logs[1].attributes['emb.server_timing.duration']).to.equal(0);
      expect(logs[1].attributes['emb.server_timing.description']).to.equal(
        'HIT',
      );

      instrumentation.disable();
    });

    /*
     * Under registerGlobally: false the logger provider is wired onto the
     * instrumentation after the constructor returns, so anything emitted
     * synchronously there goes to a logger that records nothing and is lost for
     * good: the collection guard latches and never retries.
     */
    it('does not emit while constructing', () => {
      getEntriesByTypeStub
        .withArgs('navigation')
        .returns([makeNavigationEntry([makeServerTimingEntry()])]);

      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager,
      });

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(0);

      deliverNavigationEntry();

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(1);

      instrumentation.disable();
    });

    it('does not attach a load event listener', () => {
      getEntriesByTypeStub
        .withArgs('navigation')
        .returns([makeNavigationEntry([makeServerTimingEntry()])]);

      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager,
      });

      const loadListenerAdded = addEventListenerSpy.args.some(
        ([event]) => event === 'load',
      );
      expect(loadListenerAdded).to.be.false;

      instrumentation.disable();
    });

    /*
     * The opposite of DocumentLoadInstrumentation, which must subscribe
     * unbuffered. Server timings are complete on the entry from the start, and
     * the SDK usually starts after it was buffered, so dropping the replay
     * would mean never being notified.
     */
    it('subscribes with the buffered flag', () => {
      getEntriesByTypeStub
        .withArgs('navigation')
        .returns([makeNavigationEntry([makeServerTimingEntry()])]);

      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager,
      });

      expect(FakePerformanceObserver.latest().observedOptions).to.deep.equal({
        type: 'navigation',
        buffered: true,
      });

      instrumentation.disable();
    });
  });

  describe('regardless of when the SDK starts', () => {
    /*
     * Server timings come from the response headers, so they are readable long
     * before the load event and readyState takes no part in deciding when to
     * collect them.
     */
    ['complete', 'loading', 'interactive'].forEach((readyState) => {
      it(`emits logs when readyState is ${readyState}`, () => {
        Object.defineProperty(window.document, 'readyState', {
          writable: true,
          value: readyState,
        });
        getEntriesByTypeStub.withArgs('navigation').returns([
          makeNavigationEntry([
            makeServerTimingEntry({
              name: 'api',
              duration: 42,
              description: 'ok',
            }),
          ]),
        ]);

        const instrumentation = new ServerTimingInstrumentation({
          perf,
          limitManager,
        });
        deliverNavigationEntry();

        const logs = memoryExporter.getFinishedLogRecords();
        expect(logs).to.have.length(1);
        expect(logs[0].attributes['emb.server_timing.name']).to.equal('api');

        instrumentation.disable();
      });
    });

    it('emits no logs when disabled before the entry arrives', () => {
      getEntriesByTypeStub
        .withArgs('navigation')
        .returns([makeNavigationEntry([makeServerTimingEntry()])]);

      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager,
      });
      instrumentation.disable();

      deliverNavigationEntry();

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(0);
    });
  });

  describe('limit manager', () => {
    it('stops emitting once the server_timing limit is reached', () => {
      const entries = Array.from({ length: 3 }, (_, i) =>
        makeServerTimingEntry({ name: `svc${i.toString()}`, duration: i }),
      );
      getEntriesByTypeStub
        .withArgs('navigation')
        .returns([makeNavigationEntry(entries)]);

      const customLimitManager = new EmbraceLimitManager({
        ...DEFAULT_LIMITS,
        maxAllowed: { ...DEFAULT_LIMITS.maxAllowed, server_timing: 2 },
      });
      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager: customLimitManager,
      });
      deliverNavigationEntry();

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(2);

      instrumentation.disable();
    });
  });

  describe('duplicate collection guard', () => {
    it('does not emit logs a second time when disabled and re-enabled', () => {
      getEntriesByTypeStub
        .withArgs('navigation')
        .returns([makeNavigationEntry([makeServerTimingEntry()])]);

      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager,
      });
      deliverNavigationEntry();

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(1);

      instrumentation.disable();
      instrumentation.enable();
      deliverNavigationEntry();

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(1);

      instrumentation.disable();
    });
  });

  describe('no-op cases', () => {
    it('emits nothing when serverTiming array is empty', () => {
      getEntriesByTypeStub
        .withArgs('navigation')
        .returns([makeNavigationEntry([])]);

      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager,
      });

      deliverNavigationEntry();

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(0);

      instrumentation.disable();
    });

    it('emits nothing when no navigation entry exists', () => {
      getEntriesByTypeStub.withArgs('navigation').returns([]);

      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager,
      });

      deliverNavigationEntry();

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(0);

      instrumentation.disable();
    });

    /* Nothing else re-triggers the read, so this is the one chance to say so. */
    it('warns and emits nothing when the navigation entry type is unobservable', () => {
      FakePerformanceObserver.supportedEntryTypes = [];
      getEntriesByTypeStub
        .withArgs('navigation')
        .returns([makeNavigationEntry([makeServerTimingEntry()])]);
      const warnings: string[] = [];

      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager,
        diag: {
          verbose: () => {},
          debug: () => {},
          info: () => {},
          warn: (message: string) => warnings.push(message),
          error: () => {},
        },
      });

      deliverNavigationEntry();

      expect(FakePerformanceObserver.instances).to.have.length(0);
      expect(memoryExporter.getFinishedLogRecords()).to.have.length(0);
      expect(warnings.join(' ')).to.contain('navigation');

      instrumentation.disable();
    });
  });
});
