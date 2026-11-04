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
import { session } from '../../api-sessions/index.ts';
import type { UserSessionManagerInternal } from '../../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
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

  describe('session part listeners', () => {
    let userSessionManager: UserSessionManagerInternal;

    beforeEach(() => {
      userSessionManager = new EmbraceUserSessionManager({
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
        limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
        perf: new OTelPerformanceManager(),
        storage: setupTestStorage(),
        visibilityDoc: window.document,
      });
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

    it('re-binds listeners to a user session manager set after enable', () => {
      instrumentation = new FakeInstrumentation();
      instrumentation.enable();

      const replacementManager = new EmbraceUserSessionManager({
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
        limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
        perf: new OTelPerformanceManager(),
        storage: setupTestStorage(),
        visibilityDoc: window.document,
      });
      instrumentation.setUserSessionManager(replacementManager);

      replacementManager.startSessionPartInternal({ reason: 'init' });

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
