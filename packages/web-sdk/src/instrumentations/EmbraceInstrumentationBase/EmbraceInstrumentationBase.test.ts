import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  FakeInstrumentation,
  setupTestStorage,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../tests/utils/index.ts';
import { log } from '../../api-logs/index.ts';
import { page } from '../../api-page/index.ts';
import { session } from '../../api-sessions/index.ts';
import type { UserSessionManagerInternal } from '../../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceLogManager,
  EmbracePageManager,
  EmbraceUserSessionManager,
} from '../../managers/index.ts';
import { OTelPerformanceManager } from '../../utils/index.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceInstrumentationBase', () => {
  let instrumentation: FakeInstrumentation;

  beforeEach(() => {
    instrumentation = new FakeInstrumentation();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('fires _onEnable once when enabling a disabled instrumentation', () => {
    instrumentation.enable();
    instrumentation.enable();

    expect(instrumentation.enableHookCalls).to.equal(1);
  });

  it('fires _onDisable once when disabling an enabled instrumentation', () => {
    instrumentation.enable();
    instrumentation.disable();
    instrumentation.disable();

    expect(instrumentation.disableHookCalls).to.equal(1);
  });

  it('fires each hook once per state flip across a full toggle cycle', () => {
    instrumentation.enable();
    instrumentation.disable();
    instrumentation.enable();

    expect(instrumentation.enableHookCalls).to.equal(2);
    expect(instrumentation.disableHookCalls).to.equal(1);
  });

  it('emits through the providers passed to enable()', () => {
    const spanExporter = new InMemorySpanExporter();
    const tracerProvider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter: spanExporter })],
    });
    const logExporter = new InMemoryLogRecordExporter();
    const loggerProvider = new LoggerProvider({
      processors: [new SimpleLogRecordProcessor({ exporter: logExporter })],
    });

    instrumentation.enable({ tracerProvider, loggerProvider });
    instrumentation.emit();

    expect(
      spanExporter.getFinishedSpans().map((span) => span.name),
    ).to.deep.equal(['my span']);
    expect(
      logExporter.getFinishedLogRecords().map((record) => record.body),
    ).to.deep.equal(['my log']);
  });

  const createUserSessionManager = (): UserSessionManagerInternal =>
    new EmbraceUserSessionManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      perf: new OTelPerformanceManager(),
      storage: setupTestStorage(),
      visibilityDoc: window.document,
    });

  describe('managers', () => {
    it('throws from every manager getter before the first enable()', () => {
      for (const [name, read] of Object.entries(instrumentation.managers)) {
        expect(read).to.throw(
          `FakeInstrumentation: ${name} is not available until enable() is called`,
        );
      }
    });

    it('uses the managers passed to the first enable()', () => {
      const userSessionManager = createUserSessionManager();
      const limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);
      const logManager = new EmbraceLogManager({
        userSessionManager,
        limitManager,
        storage: setupTestStorage(),
        visibilityDoc: window.document,
      });
      const perf = new OTelPerformanceManager();
      const pageManager = new EmbracePageManager();

      instrumentation.enable({
        userSessionManager,
        logManager,
        limitManager,
        perf,
        pageManager,
      });

      expect(instrumentation.managers.userSessionManager()).to.equal(
        userSessionManager,
      );
      expect(instrumentation.managers.logManager()).to.equal(logManager);
      expect(instrumentation.managers.limitManager()).to.equal(limitManager);
      expect(instrumentation.managers.perf()).to.equal(perf);
      expect(instrumentation.managers.pageManager()).to.equal(pageManager);
    });

    it('keeps the managers from the first enable() after a disable and a later enable()', () => {
      const firstManager = createUserSessionManager();
      const secondManager = createUserSessionManager();

      instrumentation.enable({ userSessionManager: firstManager });
      instrumentation.disable();
      instrumentation.enable({ userSessionManager: secondManager });

      expect(instrumentation.managers.userSessionManager()).to.equal(
        firstManager,
      );
      secondManager.startSessionPartInternal({ reason: 'init' });
      expect(instrumentation.startCount).to.equal(0);
      firstManager.startSessionPartInternal({ reason: 'init' });
      expect(instrumentation.startCount).to.equal(1);
    });

    it('falls back to the global managers and no limits when enable() passes none', () => {
      instrumentation.enable();

      expect(instrumentation.managers.userSessionManager()).to.equal(
        session.getUserSessionManager(),
      );
      expect(instrumentation.managers.logManager()).to.equal(
        log.getLogManager(),
      );
      expect(instrumentation.managers.pageManager()).to.equal(
        page.getPageManager(),
      );
      expect(instrumentation.managers.limitManager()).to.equal(undefined);
      expect(instrumentation.managers.perf()).to.be.instanceOf(
        OTelPerformanceManager,
      );
    });
  });

  describe('session part listeners', () => {
    let userSessionManager: UserSessionManagerInternal;

    beforeEach(() => {
      userSessionManager = createUserSessionManager();
      session.setGlobalUserSessionManager(userSessionManager);
    });

    it('attaches no listeners while constructed but never enabled', () => {
      instrumentation = new FakeInstrumentation();

      userSessionManager.startSessionPartInternal({ reason: 'init' });
      userSessionManager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
      });

      expect(instrumentation.startCount).to.equal(0);
      expect(instrumentation.endCount).to.equal(0);
    });

    it('invokes the start listener when a session part starts', () => {
      instrumentation = new FakeInstrumentation();
      instrumentation.enable();

      userSessionManager.startSessionPartInternal({ reason: 'init' });

      expect(instrumentation.startCount).to.equal(1);
    });

    it('invokes the end listener when a session part ends', () => {
      instrumentation = new FakeInstrumentation();
      instrumentation.enable();

      userSessionManager.startSessionPartInternal({ reason: 'init' });
      userSessionManager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
      });

      expect(instrumentation.endCount).to.equal(1);
    });

    it('stops invoking listeners after disable()', () => {
      instrumentation = new FakeInstrumentation();
      instrumentation.enable();
      instrumentation.disable();

      userSessionManager.startSessionPartInternal({ reason: 'init' });
      userSessionManager.endSessionPartInternal({
        reason: 'web_foreground_inactivity',
      });

      expect(instrumentation.startCount).to.equal(0);
      expect(instrumentation.endCount).to.equal(0);
    });

    it('listens on the user session manager passed to enable() instead of the global one', () => {
      const instanceManager = createUserSessionManager();
      instrumentation = new FakeInstrumentation();
      instrumentation.enable({ userSessionManager: instanceManager });

      userSessionManager.startSessionPartInternal({ reason: 'init' });
      expect(instrumentation.startCount).to.equal(0);
      instanceManager.startSessionPartInternal({ reason: 'init' });
      expect(instrumentation.startCount).to.equal(1);
    });

    it('removes the listeners when _onEnable throws', () => {
      instrumentation = new (class extends FakeInstrumentation {
        protected override _onEnable(): void {
          super._onEnable();
          throw new Error('enable failed');
        }
      })();
      instrumentation.enable();

      expect(instrumentation.isEnabled()).to.equal(false);

      userSessionManager.startSessionPartInternal({ reason: 'init' });

      expect(instrumentation.startCount).to.equal(0);
    });

    it('removes the listeners when _onDisable throws', () => {
      instrumentation = new (class extends FakeInstrumentation {
        protected override _onDisable(): void {
          throw new Error('disable failed');
        }
      })();
      instrumentation.enable();
      instrumentation.disable();

      expect(instrumentation.isEnabled()).to.equal(false);

      userSessionManager.startSessionPartInternal({ reason: 'init' });

      expect(instrumentation.startCount).to.equal(0);
    });
  });
});
