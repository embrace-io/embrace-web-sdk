import * as chai from 'chai';
import * as sinon from 'sinon';
import { InMemoryDiagLogger } from '../../../../tests/utils/index.ts';
import { NoOpLogManager } from '../../../api-logs/index.ts';
import { page } from '../../../api-page/index.ts';
import {
  EMB_NAVIGATION_INSTRUMENTATIONS,
  EMB_TYPES,
} from '../../../constants/index.ts';
import { EmbracePageManager } from '../../../managers/index.ts';
import { BrowserNavigationInstrumentation } from './BrowserNavigationInstrumentation.ts';
import type { NavigationAPI } from './types.ts';

const { expect } = chai;

const getWindowRecord = (): Record<string, unknown> => window as never;

const removeNavigationAPI = (): NavigationAPI | undefined => {
  const winRecord = getWindowRecord();
  const saved = winRecord['navigation'] as NavigationAPI | undefined;
  delete winRecord['navigation'];
  return saved;
};

const restoreNavigationAPI = (saved: NavigationAPI | undefined) => {
  if (saved) {
    getWindowRecord()['navigation'] = saved;
  }
};

describe('BrowserNavigationInstrumentation', () => {
  let diag: InMemoryDiagLogger;
  let logManager: NoOpLogManager;
  let messageSpy: sinon.SinonSpy;
  let pageManager: EmbracePageManager;
  let originalPushState: typeof history.pushState;
  let originalReplaceState: typeof history.replaceState;

  before(() => {
    originalPushState = history.pushState.bind(history);
    originalReplaceState = history.replaceState.bind(history);
  });

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
    logManager = new NoOpLogManager();
    messageSpy = sinon.spy(logManager, 'message');

    pageManager = new EmbracePageManager();
    page.setGlobalPageManager(pageManager);
  });

  afterEach(() => {
    sinon.restore();
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  });

  const createInstrumentation = (
    options: ConstructorParameters<
      typeof BrowserNavigationInstrumentation
    >[0] = {},
  ) => {
    const instrumentation = new BrowserNavigationInstrumentation({
      diag,
      ...options,
    });
    instrumentation.setLogManager(logManager);
    return instrumentation;
  };

  describe('history.pushState detection (Layer 3)', () => {
    it('should detect pushState navigations and emit log events', () => {
      const savedNav = removeNavigationAPI();

      try {
        const instrumentation = createInstrumentation();

        const initialUrl = location.href;

        history.pushState({}, '', '/test-push-1');
        history.pushState({}, '', '/test-push-2');

        instrumentation.disable();

        expect(messageSpy.callCount).to.equal(2);

        const firstCall = messageSpy.getCall(0);
        expect(firstCall.args[0]).to.equal('navigation');
        expect(firstCall.args[1]).to.equal('info');
        expect(firstCall.args[2].attributes['emb.type']).to.equal(
          EMB_TYPES.Navigation,
        );
        expect(firstCall.args[2].attributes['emb.instrumentation']).to.equal(
          EMB_NAVIGATION_INSTRUMENTATIONS.Browser,
        );
        expect(firstCall.args[2].attributes['emb.navigation.type']).to.equal(
          'spa_navigation',
        );
        expect(
          firstCall.args[2].attributes['emb.navigation.detection_source'],
        ).to.equal('history_patch');
        expect(firstCall.args[2].attributes['emb.referrer_url']).to.equal(
          initialUrl,
        );
        expect(firstCall.args[2].attributes['app.surface.name']).to.equal(
          '/test-push-1',
        );
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });

    it('should detect replaceState navigations', () => {
      const savedNav = removeNavigationAPI();

      try {
        const instrumentation = createInstrumentation();

        history.replaceState({}, '', '/test-replace');

        instrumentation.disable();

        expect(messageSpy.callCount).to.equal(1);
        expect(
          messageSpy.getCall(0).args[2].attributes['emb.navigation.type'],
        ).to.equal('spa_navigation');
        expect(
          messageSpy.getCall(0).args[2].attributes[
            'emb.navigation.detection_source'
          ],
        ).to.equal('history_patch');
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });
  });

  describe('route matcher', () => {
    it('should use routeMatcher to resolve route paths', () => {
      const savedNav = removeNavigationAPI();

      try {
        const routeMatcher = (url: string): string => {
          const pathname = new URL(url, location.href).pathname;
          if (pathname.startsWith('/products/')) {
            return '/products/:id';
          }
          return pathname;
        };

        const instrumentation = createInstrumentation({ routeMatcher });

        history.pushState({}, '', '/products/123');
        history.pushState({}, '', '/products/456');

        instrumentation.disable();

        expect(messageSpy.callCount).to.equal(2);
        expect(
          messageSpy.getCall(0).args[2].attributes['app.surface.name'],
        ).to.equal('/products/:id');
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });
  });

  describe('routeMatcher error handling', () => {
    it('should fall back to pathname when routeMatcher throws', () => {
      const savedNav = removeNavigationAPI();

      try {
        const routeMatcher = (): string => {
          throw new Error('matcher failed');
        };

        const instrumentation = createInstrumentation({ routeMatcher });

        history.pushState({}, '', '/fallback-test');

        instrumentation.disable();

        expect(messageSpy.callCount).to.equal(1);
        expect(
          messageSpy.getCall(0).args[2].attributes['app.surface.name'],
        ).to.equal('/fallback-test');
        expect(diag.getErrorLogs()).to.include(
          `routeMatcher threw for url=${location.origin}/fallback-test, falling back to pathname`,
        );
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });
  });

  describe('emitHardNavigations', () => {
    it('should emit hard navigation log when emitHardNavigations is true', () => {
      const savedNav = removeNavigationAPI();

      try {
        // Construct disabled, set log manager, then enable — so the hard
        // navigation log is captured by the spy.
        const instrumentation = new BrowserNavigationInstrumentation({
          diag,
          emitHardNavigations: true,
          enabled: false,
        });
        instrumentation.setLogManager(logManager);
        instrumentation.enable();

        instrumentation.disable();

        const hardNavCalls = messageSpy
          .getCalls()
          .filter(
            (call: sinon.SinonSpyCall) =>
              call.args[2].attributes['emb.navigation.type'] ===
              'hard_navigation',
          );
        expect(hardNavCalls).to.have.lengthOf(1);
        expect(
          hardNavCalls[0].args[2].attributes['emb.navigation.detection_source'],
        ).to.equal('perf_timing');
      } finally {
        restoreNavigationAPI(savedNav);
      }
    });

    it('should not emit hard navigation log by default', () => {
      const savedNav = removeNavigationAPI();

      try {
        const instrumentation = new BrowserNavigationInstrumentation({
          diag,
          enabled: false,
        });
        instrumentation.setLogManager(logManager);
        instrumentation.enable();

        instrumentation.disable();

        const hardNavCalls = messageSpy
          .getCalls()
          .filter(
            (call: sinon.SinonSpyCall) =>
              call.args[2].attributes['emb.navigation.type'] ===
              'hard_navigation',
          );
        expect(hardNavCalls).to.have.lengthOf(0);
      } finally {
        restoreNavigationAPI(savedNav);
      }
    });
  });

  describe('page context', () => {
    it('should update page context via page.setCurrentRoute()', () => {
      const savedNav = removeNavigationAPI();

      try {
        const setRouteSpy = sinon.spy(pageManager, 'setCurrentRoute');

        const instrumentation = createInstrumentation();

        history.pushState({}, '', '/context-test');

        instrumentation.disable();

        expect(setRouteSpy.calledOnce).to.be.true;
        expect(setRouteSpy.getCall(0).args[0]).to.deep.include({
          path: '/context-test',
        });
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });
  });

  describe('enable/disable lifecycle', () => {
    it('should not emit events after disable', () => {
      const savedNav = removeNavigationAPI();

      try {
        const instrumentation = createInstrumentation();

        history.pushState({}, '', '/before-disable');
        instrumentation.disable();

        history.pushState({}, '', '/after-disable');

        expect(messageSpy.callCount).to.equal(1);
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });

    it('should restore history methods after disable', () => {
      const savedNav = removeNavigationAPI();

      try {
        const pushStateBefore = history.pushState;

        const instrumentation = createInstrumentation();

        const patchedPushState = history.pushState;
        expect(patchedPushState).to.not.equal(pushStateBefore);

        instrumentation.disable();

        expect(history.pushState).to.not.equal(patchedPushState);
      } finally {
        restoreNavigationAPI(savedNav);
      }
    });

    it('should re-enable after disable', () => {
      const savedNav = removeNavigationAPI();

      try {
        const instrumentation = createInstrumentation();

        history.pushState({}, '', '/before-cycle');
        instrumentation.disable();

        instrumentation.enable();
        instrumentation.setLogManager(logManager);

        history.pushState({}, '', '/after-reenable');
        instrumentation.disable();

        expect(messageSpy.callCount).to.equal(2);
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });
  });

  describe('double enable', () => {
    it('should handle enable() called twice without disable()', () => {
      const savedNav = removeNavigationAPI();

      try {
        const instrumentation = createInstrumentation();

        history.pushState({}, '', '/before-double-enable');

        instrumentation.enable();
        instrumentation.setLogManager(logManager);

        history.pushState({}, '', '/after-double-enable');

        instrumentation.disable();

        expect(messageSpy.callCount).to.equal(2);
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });
  });

  describe('constructor options', () => {
    it('should not auto-enable when enabled is false', () => {
      const savedNav = removeNavigationAPI();

      try {
        const instrumentation = createInstrumentation({ enabled: false });

        history.pushState({}, '', '/should-not-detect');

        instrumentation.disable();

        expect(messageSpy.callCount).to.equal(0);
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });

    it('should work with default config (no args)', () => {
      const savedNav = removeNavigationAPI();

      try {
        const instrumentation = new BrowserNavigationInstrumentation();
        instrumentation.setLogManager(logManager);

        history.pushState({}, '', '/default-config');

        instrumentation.disable();

        expect(messageSpy.callCount).to.equal(1);
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });
  });

  describe('same URL navigation', () => {
    it('should not emit log when navigating to the same URL', (done) => {
      const savedNav = removeNavigationAPI();

      const instrumentation = createInstrumentation();

      history.pushState({}, '', '/same-url-test');

      // Wait for dedup window to pass so observeNavigations emits again
      setTimeout(() => {
        history.pushState({}, '', '/same-url-test');

        instrumentation.disable();

        // Only 1 log — second navigation to same URL skipped by _handleNavigation
        expect(messageSpy.callCount).to.equal(1);

        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
        done();
      }, 60);
    });
  });

  describe('_handleNavigation enabled guard', () => {
    it('should skip navigation when config.enabled is false', () => {
      const savedNav = removeNavigationAPI();

      try {
        const instrumentation = createInstrumentation();

        // Disable config without calling disable() — observers remain active
        instrumentation.setConfig({ enabled: false });

        history.pushState({}, '', '/while-disabled');

        // Re-enable to allow proper cleanup
        instrumentation.setConfig({ enabled: true });
        instrumentation.disable();

        expect(messageSpy.callCount).to.equal(0);
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });
  });

  describe('disable edge cases', () => {
    it('should handle disable when already disabled', () => {
      const savedNav = removeNavigationAPI();

      try {
        const instrumentation = createInstrumentation();

        history.pushState({}, '', '/disable-twice');

        instrumentation.disable();
        instrumentation.disable();

        expect(messageSpy.callCount).to.equal(1);
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });
  });

  describe('heuristic validation', () => {
    it('should emit immediately when heuristic validation is disabled (default)', () => {
      const savedNav = removeNavigationAPI();

      try {
        const instrumentation = createInstrumentation();

        history.pushState({}, '', '/no-heuristic');
        instrumentation.disable();

        expect(messageSpy.callCount).to.equal(1);
        expect(
          messageSpy.getCall(0).args[2].attributes['emb.navigation.confidence'],
        ).to.be.undefined;
      } finally {
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
      }
    });

    it('should delay emit and add confidence attributes when heuristic validation is enabled', (done) => {
      const savedNav = removeNavigationAPI();

      const instrumentation = createInstrumentation({
        enableHeuristicValidation: true,
        domSettleDelay: 60,
        maxSettleDelay: 500,
        domScoreThreshold: 5,
        allowWithoutInteraction: true,
        minimumConfidence: 'low' as const,
      });

      history.pushState({}, '', '/heuristic-test');

      // Not emitted yet — waiting for settle
      expect(messageSpy.callCount).to.equal(0);

      // Add DOM to boost confidence
      const el = document.createElement('section');
      const article = document.createElement('article');
      const h1 = document.createElement('h1');
      h1.textContent = 'Page Title';
      article.appendChild(h1);
      el.appendChild(article);
      document.body.appendChild(el);

      setTimeout(() => {
        expect(messageSpy.callCount).to.equal(1);
        const attrs = messageSpy.getCall(0).args[2].attributes;
        expect(attrs['emb.navigation.confidence']).to.be.a('string');
        expect(attrs['emb.navigation.dom_score']).to.be.a('string');
        expect(attrs['emb.navigation.title_changed']).to.be.a('string');
        expect(attrs['emb.navigation.scroll_reset']).to.be.a('string');

        instrumentation.disable();
        document.body.removeChild(el);
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
        done();
      }, 120);
    });

    it('should discard navigation below minimum confidence', (done) => {
      const savedNav = removeNavigationAPI();

      const instrumentation = createInstrumentation({
        enableHeuristicValidation: true,
        domSettleDelay: 50,
        maxSettleDelay: 200,
        domScoreThreshold: 1000,
        minimumConfidence: 'high' as const,
        allowWithoutInteraction: true,
      });

      history.pushState({}, '', '/low-confidence');

      setTimeout(() => {
        // Should be discarded — no DOM changes, confidence is low
        expect(messageSpy.callCount).to.equal(0);

        instrumentation.disable();
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
        done();
      }, 100);
    });

    it('should handle rapid navigations in heuristic mode', (done) => {
      const savedNav = removeNavigationAPI();

      const instrumentation = createInstrumentation({
        enableHeuristicValidation: true,
        domSettleDelay: 80,
        maxSettleDelay: 500,
        allowWithoutInteraction: true,
        minimumConfidence: 'low' as const,
      });

      history.pushState({}, '', '/rapid-1');

      setTimeout(() => {
        history.pushState({}, '', '/rapid-2');

        // First navigation should have been finalized immediately
        expect(messageSpy.callCount).to.equal(1);
        expect(
          messageSpy.getCall(0).args[2].attributes['app.surface.name'],
        ).to.equal('/rapid-1');

        setTimeout(() => {
          // Second should have settled
          expect(messageSpy.callCount).to.equal(2);
          expect(
            messageSpy.getCall(1).args[2].attributes['app.surface.name'],
          ).to.equal('/rapid-2');

          instrumentation.disable();
          restoreNavigationAPI(savedNav);
          history.replaceState({}, '', '/');
          done();
        }, 120);
      }, 30);
    });

    it('should discard navigation without interaction when allowWithoutInteraction is false', (done) => {
      const savedNav = removeNavigationAPI();

      const instrumentation = createInstrumentation({
        enableHeuristicValidation: true,
        domSettleDelay: 50,
        maxSettleDelay: 200,
        allowWithoutInteraction: false,
        minimumConfidence: 'low' as const,
      });

      history.pushState({}, '', '/no-interaction');

      setTimeout(() => {
        // Discarded — no interaction and confidence not high enough
        expect(messageSpy.callCount).to.equal(0);

        instrumentation.disable();
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
        done();
      }, 100);
    });

    it('should emit high-confidence navigation without interaction when allowWithoutInteraction is false', (done) => {
      const savedNav = removeNavigationAPI();

      const instrumentation = createInstrumentation({
        enableHeuristicValidation: true,
        domSettleDelay: 50,
        maxSettleDelay: 500,
        domScoreThreshold: 5,
        allowWithoutInteraction: false,
        minimumConfidence: 'low' as const,
      });

      history.pushState({}, '', '/high-confidence-no-interaction');

      // Add substantial DOM to reach high confidence without any interaction
      const container = document.createElement('section');
      const article = document.createElement('article');
      const h1 = document.createElement('h1');
      h1.textContent = 'Page Title';
      const p1 = document.createElement('p');
      p1.textContent = 'Content one';
      const p2 = document.createElement('p');
      p2.textContent = 'Content two';
      article.appendChild(h1);
      article.appendChild(p1);
      article.appendChild(p2);
      container.appendChild(article);
      document.body.appendChild(container);

      setTimeout(() => {
        // Should emit despite no interaction — confidence is high from DOM score
        expect(messageSpy.callCount).to.equal(1);
        const attrs = messageSpy.getCall(0).args[2].attributes;
        expect(attrs['emb.navigation.confidence']).to.be.oneOf([
          'high',
          'very-high',
        ]);

        instrumentation.disable();
        document.body.removeChild(container);
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
        done();
      }, 100);
    });

    it('should include interaction attributes when user interacts before navigation', (done) => {
      const savedNav = removeNavigationAPI();

      const instrumentation = createInstrumentation({
        enableHeuristicValidation: true,
        domSettleDelay: 50,
        maxSettleDelay: 500,
        domScoreThreshold: 5,
        allowWithoutInteraction: true,
        minimumConfidence: 'low' as const,
      });

      // Simulate a click before navigation
      window.dispatchEvent(new Event('click', { bubbles: true }));

      setTimeout(() => {
        history.pushState({}, '', '/interaction-attrs');

        // Add DOM to boost confidence
        const el = document.createElement('section');
        const article = document.createElement('article');
        const h1 = document.createElement('h1');
        h1.textContent = 'Title';
        article.appendChild(h1);
        el.appendChild(article);
        document.body.appendChild(el);

        setTimeout(() => {
          expect(messageSpy.callCount).to.equal(1);
          const attrs = messageSpy.getCall(0).args[2].attributes;
          expect(attrs['emb.navigation.interaction_type']).to.equal('click');
          expect(attrs['emb.navigation.interaction_latency_ms']).to.be.a(
            'string',
          );

          instrumentation.disable();
          document.body.removeChild(el);
          restoreNavigationAPI(savedNav);
          history.replaceState({}, '', '/');
          done();
        }, 100);
      }, 10);
    });

    it('should clean up pending validation on disable', (done) => {
      const savedNav = removeNavigationAPI();

      const instrumentation = createInstrumentation({
        enableHeuristicValidation: true,
        domSettleDelay: 80,
        maxSettleDelay: 500,
      });

      history.pushState({}, '', '/pending-disable');

      // Disable while validation is pending — _pendingEvent is cleared before
      // validator.stop(), so the settled callback is a no-op
      instrumentation.disable();

      setTimeout(() => {
        expect(messageSpy.callCount).to.equal(0);
        restoreNavigationAPI(savedNav);
        history.replaceState({}, '', '/');
        done();
      }, 150);
    });
  });
});
