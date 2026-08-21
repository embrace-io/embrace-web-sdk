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
  let onEnableSpy: sinon.SinonSpy;
  let onDisableSpy: sinon.SinonSpy;

  beforeEach(() => {
    instrumentation = new FakeInstrumentation();
    onEnableSpy = sinon.spy(instrumentation, 'onEnable');
    onDisableSpy = sinon.spy(instrumentation, 'onDisable');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('fires onEnable once when enabling a disabled instrumentation', () => {
    instrumentation.enable();
    instrumentation.enable();

    expect(onEnableSpy).to.have.been.calledOnce;
  });

  it('fires onDisable once when disabling an enabled instrumentation', () => {
    instrumentation.enable();
    instrumentation.disable();
    instrumentation.disable();

    expect(onDisableSpy).to.have.been.calledOnce;
  });

  it('fires each hook once per state flip across a full toggle cycle', () => {
    instrumentation.enable();
    instrumentation.disable();
    instrumentation.enable();

    expect(onEnableSpy).to.have.been.calledTwice;
    expect(onDisableSpy).to.have.been.calledOnce;
  });

  // registerInstrumentations only enables instrumentations whose config still
  // reports them disabled, so a setConfig that flips the flag would leave the
  // instrumentation permanently skipped with onEnable never run.
  it('keeps a constructed instrumentation disabled across setConfig', () => {
    instrumentation.setConfig({});

    expect(instrumentation.getConfig().enabled).to.equal(false);

    instrumentation.enable();

    expect(onEnableSpy).to.have.been.calledOnce;
  });

  it('keeps an enabled instrumentation enabled across setConfig', () => {
    instrumentation.enable();
    instrumentation.setConfig({ enabled: false });

    expect(instrumentation.getConfig().enabled).to.equal(true);

    instrumentation.disable();

    expect(onDisableSpy).to.have.been.calledOnce;
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
  });
});
