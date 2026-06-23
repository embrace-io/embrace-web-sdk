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

describe('ServerTimingInstrumentation', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let perf: MockPerformanceManager;
  let clock: sinon.SinonFakeTimers;
  let getEntriesByTypeStub: sinon.SinonStub;
  let addEventListenerSpy: sinon.SinonSpy;
  let limitManager: EmbraceLimitManager;

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

    Object.defineProperty(window.document, 'readyState', {
      writable: true,
      value: 'complete',
    });
  });

  afterEach(() => {
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

  describe('when document.readyState is complete', () => {
    it('reads immediately and emits one log per server timing entry', () => {
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
  });

  describe('when document.readyState is not complete', () => {
    beforeEach(() => {
      Object.defineProperty(window.document, 'readyState', {
        writable: true,
        value: 'loading',
      });
    });

    it('attaches a load listener and emits logs when load fires', () => {
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

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(0);

      const loadListenerAdded = addEventListenerSpy.args.some(
        ([event]) => event === 'load',
      );
      expect(loadListenerAdded).to.be.true;

      window.dispatchEvent(new Event('load'));

      const logs = memoryExporter.getFinishedLogRecords();
      expect(logs).to.have.length(1);
      expect(logs[0].attributes['emb.server_timing.name']).to.equal('api');

      instrumentation.disable();
    });

    it('emits no logs when disable() is called before load fires', () => {
      getEntriesByTypeStub
        .withArgs('navigation')
        .returns([makeNavigationEntry([makeServerTimingEntry()])]);

      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager,
      });
      instrumentation.disable();

      window.dispatchEvent(new Event('load'));

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

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(1);

      instrumentation.disable();
      instrumentation.enable();

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

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(0);

      instrumentation.disable();
    });

    it('emits nothing when no navigation entry exists', () => {
      getEntriesByTypeStub.withArgs('navigation').returns([]);

      const instrumentation = new ServerTimingInstrumentation({
        perf,
        limitManager,
      });

      expect(memoryExporter.getFinishedLogRecords()).to.have.length(0);

      instrumentation.disable();
    });
  });
});
