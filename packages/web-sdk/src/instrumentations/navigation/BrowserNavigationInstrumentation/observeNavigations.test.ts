import * as chai from 'chai';
import * as sinon from 'sinon';
import { InMemoryDiagLogger } from '../../../../tests/utils/index.ts';
import { observeNavigations } from './observeNavigations.ts';
import type {
  NavigateEvent,
  NavigationAPI,
  NavigationEvent,
  SoftNavigationEntry,
} from './types.ts';

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

const createMockNavigationAPI = () => {
  let navigateHandler: ((event: NavigateEvent) => void) | null = null;
  let successHandler: (() => void) | null = null;
  let errorHandler: (() => void) | null = null;

  return {
    addEventListener: (type: string, listener: (...args: never[]) => void) => {
      if (type === 'navigate') {
        navigateHandler = listener as never;
      } else if (type === 'navigatesuccess') {
        successHandler = listener as never;
      } else if (type === 'navigateerror') {
        errorHandler = listener as never;
      }
    },
    removeEventListener: (type: string) => {
      if (type === 'navigate') {
        navigateHandler = null;
      } else if (type === 'navigatesuccess') {
        successHandler = null;
      } else if (type === 'navigateerror') {
        errorHandler = null;
      }
    },
    dispatchNavigate: (event: NavigateEvent) => navigateHandler?.(event),
    dispatchSuccess: () => successHandler?.(),
    dispatchError: () => errorHandler?.(),
    get hasListeners() {
      return !!(navigateHandler || successHandler || errorHandler);
    },
  };
};

const makeNavigateEvent = (
  url: string,
  navigationType: string,
  sameDocument = true,
): NavigateEvent =>
  ({
    destination: { sameDocument, url },
    navigationType,
  }) as NavigateEvent;

describe('observeNavigations', () => {
  const sandbox = sinon.createSandbox();
  let diag: InMemoryDiagLogger;
  let events: NavigationEvent[];
  let savedNavigationAPI: NavigationAPI | undefined;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
    events = [];
  });

  afterEach(() => {
    sandbox.restore();
  });

  const recordCallback = (event: NavigationEvent): void => {
    events.push(event);
  };

  describe('Layer 0: PerformanceNavigationTiming', () => {
    beforeEach(() => {
      savedNavigationAPI = removeNavigationAPI();
    });

    afterEach(() => {
      restoreNavigationAPI(savedNavigationAPI);
      history.replaceState({}, '', '/');
    });

    it('should emit reload for reload navigation type', () => {
      const stub = sandbox.stub(performance, 'getEntriesByType');
      stub.returns([]);
      stub
        .withArgs('navigation')
        .returns([{ type: 'reload' } as PerformanceNavigationTiming]);

      const cleanup = observeNavigations(recordCallback, diag);
      cleanup();

      const perfEvents = events.filter((e) => e.source === 'perf_timing');
      expect(perfEvents).to.have.lengthOf(1);
      expect(perfEvents[0].type).to.equal('reload');
    });

    it('should emit back_forward for back_forward navigation type', () => {
      const stub = sandbox.stub(performance, 'getEntriesByType');
      stub.returns([]);
      stub
        .withArgs('navigation')
        .returns([{ type: 'back_forward' } as PerformanceNavigationTiming]);

      const cleanup = observeNavigations(recordCallback, diag);
      cleanup();

      const perfEvents = events.filter((e) => e.source === 'perf_timing');
      expect(perfEvents).to.have.lengthOf(1);
      expect(perfEvents[0].type).to.equal('back_forward');
    });

    it('should emit prerender_activation for prerender navigation type', () => {
      const stub = sandbox.stub(performance, 'getEntriesByType');
      stub.returns([]);
      stub
        .withArgs('navigation')
        // @ts-expect-error 'prerender' is valid in Chrome but not yet in TS NavigationTimingType
        // https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming/type
        .returns([{ type: 'prerender' } as PerformanceNavigationTiming]);

      const cleanup = observeNavigations(recordCallback, diag);
      cleanup();

      const perfEvents = events.filter((e) => e.source === 'perf_timing');
      expect(perfEvents).to.have.lengthOf(1);
      expect(perfEvents[0].type).to.equal('prerender_activation');
    });

    it('should emit hard_navigation when emitHardNavigations is true', () => {
      const stub = sandbox.stub(performance, 'getEntriesByType');
      stub.returns([]);
      stub
        .withArgs('navigation')
        .returns([{ type: 'navigate' } as PerformanceNavigationTiming]);

      const cleanup = observeNavigations(recordCallback, diag, {
        emitHardNavigations: true,
      });
      cleanup();

      const perfEvents = events.filter((e) => e.source === 'perf_timing');
      expect(perfEvents).to.have.lengthOf(1);
      expect(perfEvents[0].type).to.equal('hard_navigation');
    });

    it('should not emit for standard navigate type', () => {
      const stub = sandbox.stub(performance, 'getEntriesByType');
      stub.returns([]);
      stub
        .withArgs('navigation')
        .returns([{ type: 'navigate' } as PerformanceNavigationTiming]);

      const cleanup = observeNavigations(recordCallback, diag);
      cleanup();

      const perfEvents = events.filter((e) => e.source === 'perf_timing');
      expect(perfEvents).to.have.lengthOf(0);
    });

    it('should handle missing navigation entry', () => {
      const stub = sandbox.stub(performance, 'getEntriesByType');
      stub.returns([]);

      const cleanup = observeNavigations(recordCallback, diag);
      cleanup();

      const perfEvents = events.filter((e) => e.source === 'perf_timing');
      expect(perfEvents).to.have.lengthOf(0);
    });

    it('should log error when getEntriesByType throws', () => {
      const stub = sandbox.stub(performance, 'getEntriesByType');
      stub.withArgs('navigation').throws(new Error('test error'));

      const cleanup = observeNavigations(recordCallback, diag);
      cleanup();

      expect(diag.getErrorLogs()).to.include(
        'Failed to read PerformanceNavigationTiming',
      );
    });
  });

  describe('Layer 2: Navigation API', () => {
    let mockNav: ReturnType<typeof createMockNavigationAPI>;

    beforeEach(() => {
      savedNavigationAPI = removeNavigationAPI();
      mockNav = createMockNavigationAPI();
      getWindowRecord()['navigation'] = mockNav;
    });

    afterEach(() => {
      delete getWindowRecord()['navigation'];
      restoreNavigationAPI(savedNavigationAPI);
    });

    it('should detect same-document push navigations', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      mockNav.dispatchNavigate(
        makeNavigateEvent('http://localhost/push-test', 'push'),
      );
      mockNav.dispatchSuccess();

      cleanup();

      const navApiEvents = events.filter((e) => e.source === 'navigation_api');
      expect(navApiEvents).to.have.lengthOf(1);
      expect(navApiEvents[0].type).to.equal('spa_navigation');
      expect(navApiEvents[0].url).to.equal('http://localhost/push-test');
    });

    it('should detect same-document replace navigations', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      mockNav.dispatchNavigate(
        makeNavigateEvent('http://localhost/replace-test', 'replace'),
      );
      mockNav.dispatchSuccess();

      cleanup();

      const navApiEvents = events.filter((e) => e.source === 'navigation_api');
      expect(navApiEvents).to.have.lengthOf(1);
      expect(navApiEvents[0].type).to.equal('spa_navigation');
    });

    it('should map traverse navigationType to back_forward', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      mockNav.dispatchNavigate(
        makeNavigateEvent('http://localhost/traverse', 'traverse'),
      );
      mockNav.dispatchSuccess();

      cleanup();

      const navApiEvents = events.filter((e) => e.source === 'navigation_api');
      expect(navApiEvents).to.have.lengthOf(1);
      expect(navApiEvents[0].type).to.equal('back_forward');
    });

    it('should map reload navigationType to reload', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      mockNav.dispatchNavigate(
        makeNavigateEvent('http://localhost/reload', 'reload'),
      );
      mockNav.dispatchSuccess();

      cleanup();

      const navApiEvents = events.filter((e) => e.source === 'navigation_api');
      expect(navApiEvents).to.have.lengthOf(1);
      expect(navApiEvents[0].type).to.equal('reload');
    });

    it('should fallback to spa_navigation for unknown navigationType', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      mockNav.dispatchNavigate(
        makeNavigateEvent('http://localhost/unknown', 'custom-type'),
      );
      mockNav.dispatchSuccess();

      cleanup();

      const navApiEvents = events.filter((e) => e.source === 'navigation_api');
      expect(navApiEvents).to.have.lengthOf(1);
      expect(navApiEvents[0].type).to.equal('spa_navigation');
    });

    it('should ignore cross-document navigations', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      mockNav.dispatchNavigate(
        makeNavigateEvent('http://other-domain.com/', 'push', false),
      );
      mockNav.dispatchSuccess();

      cleanup();

      const navApiEvents = events.filter((e) => e.source === 'navigation_api');
      expect(navApiEvents).to.have.lengthOf(0);
    });

    it('should clear pending URL on navigateerror', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      mockNav.dispatchNavigate(
        makeNavigateEvent('http://localhost/error-nav', 'push'),
      );
      mockNav.dispatchError();
      mockNav.dispatchSuccess();

      cleanup();

      const navApiEvents = events.filter((e) => e.source === 'navigation_api');
      expect(navApiEvents).to.have.lengthOf(0);
    });

    it('should not emit if no pending URL on navigatesuccess', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      mockNav.dispatchSuccess();

      cleanup();

      const navApiEvents = events.filter((e) => e.source === 'navigation_api');
      expect(navApiEvents).to.have.lengthOf(0);
    });

    it('should remove listeners on cleanup', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      expect(mockNav.hasListeners).to.be.true;

      cleanup();

      expect(mockNav.hasListeners).to.be.false;
    });

    it('should handle error in Navigation API setup', () => {
      delete getWindowRecord()['navigation'];
      getWindowRecord()['navigation'] = {
        addEventListener: () => {
          throw new Error('setup error');
        },
        removeEventListener: () => {},
      };

      const cleanup = observeNavigations(recordCallback, diag);
      cleanup();

      expect(diag.getErrorLogs()).to.include(
        'Failed to setup Navigation API listener',
      );
    });
  });

  describe('Layer 3: history patch edge cases', () => {
    let originalPushState: typeof history.pushState;
    let originalReplaceState: typeof history.replaceState;

    before(() => {
      originalPushState = history.pushState.bind(history);
      originalReplaceState = history.replaceState.bind(history);
    });

    beforeEach(() => {
      savedNavigationAPI = removeNavigationAPI();
    });

    afterEach(() => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      restoreNavigationAPI(savedNavigationAPI);
      originalPushState.call(history, {}, '', '/');
    });

    it('should use location.href when pushState called without URL', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      const currentHref = location.href;
      history.pushState({}, '', undefined);

      cleanup();

      const historyEvents = events.filter((e) => e.source === 'history_patch');
      expect(historyEvents).to.have.lengthOf(1);
      expect(historyEvents[0].url).to.equal(currentHref);
    });

    it('should use location.href when replaceState called without URL', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      const currentHref = location.href;
      history.replaceState({}, '', undefined);

      cleanup();

      const historyEvents = events.filter((e) => e.source === 'history_patch');
      expect(historyEvents).to.have.lengthOf(1);
      expect(historyEvents[0].url).to.equal(currentHref);
    });

    it('should emit back_forward on popstate event', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      window.dispatchEvent(new PopStateEvent('popstate'));

      cleanup();

      const popstateEvents = events.filter((e) => e.source === 'popstate');
      expect(popstateEvents).to.have.lengthOf(1);
      expect(popstateEvents[0].type).to.equal('back_forward');
    });
  });

  describe('emit behavior', () => {
    let originalPushState: typeof history.pushState;
    let originalReplaceState: typeof history.replaceState;

    before(() => {
      originalPushState = history.pushState.bind(history);
      originalReplaceState = history.replaceState.bind(history);
    });

    beforeEach(() => {
      savedNavigationAPI = removeNavigationAPI();
    });

    afterEach(() => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      restoreNavigationAPI(savedNavigationAPI);
      originalPushState.call(history, {}, '', '/');
    });

    it('should prevent re-entrant emission', () => {
      let reEntrantAttempted = false;

      const cleanup = observeNavigations((event) => {
        events.push(event);
        if (!reEntrantAttempted) {
          reEntrantAttempted = true;
          history.pushState({}, '', '/re-entrant');
        }
      }, diag);

      history.pushState({}, '', '/initial');

      cleanup();

      expect(events).to.have.lengthOf(1);
      expect(events[0].url).to.include('/initial');
    });

    it('should deduplicate same-URL navigations within dedup window', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      history.pushState({}, '', '/dedup-log');
      history.pushState({}, '', '/dedup-log');

      cleanup();

      const historyEvents = events.filter((e) => e.source === 'history_patch');
      expect(historyEvents).to.have.lengthOf(1);
    });

    it('should emit same-URL navigation after dedup window expires', (done) => {
      const cleanup = observeNavigations(recordCallback, diag);

      history.pushState({}, '', '/dedup-expiry');

      setTimeout(() => {
        history.pushState({}, '', '/dedup-expiry');
        cleanup();

        const historyEvents = events.filter(
          (e) => e.source === 'history_patch',
        );
        expect(historyEvents).to.have.lengthOf(2);
        done();
      }, 60);
    });

    it('should reset isEmitting flag when callback throws', () => {
      let callCount = 0;

      const cleanup = observeNavigations((event) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('callback error');
        }
        events.push(event);
      }, diag);

      history.pushState({}, '', '/throw-test');
      history.pushState({}, '', '/after-throw');

      cleanup();

      expect(callCount).to.equal(2);
      expect(events).to.have.lengthOf(1);
      expect(events[0].url).to.include('/after-throw');
      expect(diag.getErrorLogs()).to.include(
        'Error in navigation callback: source=history_patch, url=' +
          `${location.origin}/throw-test`,
      );
    });

    it('should pass correct previousUrl across navigations', () => {
      const cleanup = observeNavigations(recordCallback, diag);

      const urlBefore = location.href;
      history.pushState({}, '', '/first');
      history.pushState({}, '', '/second');

      cleanup();

      expect(events[0].previousUrl).to.equal(urlBefore);
      expect(events[1].previousUrl).to.include('/first');
    });
  });

  describe('cleanup error handling', () => {
    it('should handle error during cleanup function execution', () => {
      savedNavigationAPI = removeNavigationAPI();

      const throwingMockNav = {
        addEventListener: (
          type: string,
          listener: (...args: never[]) => void,
        ) => {
          void type;
          void listener;
        },
        removeEventListener: () => {
          throw new Error('cleanup error');
        },
      };

      delete getWindowRecord()['navigation'];
      getWindowRecord()['navigation'] = throwingMockNav;

      const cleanup = observeNavigations(recordCallback, diag);

      // cleanup should not throw
      cleanup();

      expect(diag.getErrorLogs()).to.include(
        'Error during navigation observation cleanup',
      );

      delete getWindowRecord()['navigation'];
      restoreNavigationAPI(savedNavigationAPI);
    });
  });

  describe('Layer 1: Soft Navigation API', () => {
    it('should observe soft navigation entries when API is available', () => {
      savedNavigationAPI = removeNavigationAPI();

      const OriginalPO = window.PerformanceObserver;
      const perfRecord = performance as unknown as Record<string, unknown>;
      perfRecord['softNavs'] = true;

      type SoftNavListCallback = (list: {
        getEntries: () => SoftNavigationEntry[];
      }) => void;
      let capturedCallback: SoftNavListCallback | null = null;
      const mockDisconnect = sinon.stub();

      (getWindowRecord()['PerformanceObserver'] as unknown) = class {
        constructor(cb: SoftNavListCallback) {
          capturedCallback = cb;
        }
        observe() {}
        disconnect = mockDisconnect;
      };

      const cleanup = observeNavigations(recordCallback, diag);

      // Simulate soft navigation entry delivery
      if (capturedCallback) {
        (capturedCallback as SoftNavListCallback)({
          getEntries: () =>
            [{ name: 'http://localhost/soft-nav' }] as SoftNavigationEntry[],
        });

        // Also test fallback to location.href when entry.name is empty
        (capturedCallback as SoftNavListCallback)({
          getEntries: () => [{ name: '' }] as SoftNavigationEntry[],
        });
      }

      cleanup();

      expect(mockDisconnect.calledOnce).to.be.true;

      const softNavEvents = events.filter((e) => e.source === 'soft_nav_api');
      expect(softNavEvents).to.have.lengthOf(2);
      expect(softNavEvents[0].url).to.equal('http://localhost/soft-nav');
      expect(softNavEvents[0].type).to.equal('soft_navigation');
      expect(softNavEvents[1].url).to.equal(location.href);

      expect(diag.getDebugLogs()).to.include(
        'Layer 1: Soft Navigation API observer active',
      );

      delete perfRecord['softNavs'];
      getWindowRecord()['PerformanceObserver'] = OriginalPO;
      restoreNavigationAPI(savedNavigationAPI);
    });

    it('should log when Soft Navigation API is not available', () => {
      savedNavigationAPI = removeNavigationAPI();

      const OriginalPO = window.PerformanceObserver;
      const perfRecord = performance as unknown as Record<string, unknown>;
      perfRecord['softNavs'] = true;

      (getWindowRecord()['PerformanceObserver'] as unknown) = class {
        observe() {
          throw new Error('not supported');
        }
      };

      const cleanup = observeNavigations(recordCallback, diag);
      cleanup();

      expect(diag.getWarnLogs()).to.include(
        'Layer 1: Soft Navigation API not available',
      );

      delete perfRecord['softNavs'];
      getWindowRecord()['PerformanceObserver'] = OriginalPO;
      restoreNavigationAPI(savedNavigationAPI);
    });
  });

  describe('Layer 3: error handling', () => {
    it('should log error when history patching fails', () => {
      savedNavigationAPI = removeNavigationAPI();

      const origPushState = history.pushState;
      Object.defineProperty(history, 'pushState', {
        writable: false,
        configurable: true,
      });

      const cleanup = observeNavigations(recordCallback, diag);
      cleanup();

      expect(diag.getErrorLogs()).to.include('Failed to patch history API');

      Object.defineProperty(history, 'pushState', {
        value: origPushState,
        writable: true,
        configurable: true,
      });
      restoreNavigationAPI(savedNavigationAPI);
    });
  });

  describe('Layer 4: hashchange', () => {
    it('should emit hash_change on hashchange event', () => {
      savedNavigationAPI = removeNavigationAPI();

      const cleanup = observeNavigations(recordCallback, diag);

      window.dispatchEvent(new HashChangeEvent('hashchange'));

      cleanup();

      const hashEvents = events.filter((e) => e.source === 'hashchange');
      expect(hashEvents).to.have.lengthOf(1);
      expect(hashEvents[0].type).to.equal('hash_change');

      restoreNavigationAPI(savedNavigationAPI);
    });

    it('should log error when hashchange setup fails', () => {
      savedNavigationAPI = removeNavigationAPI();

      const origAddEventListener = window.addEventListener;
      window.addEventListener = ((
        type: string,
        ...args: Parameters<typeof window.addEventListener> extends [
          string,
          ...infer R,
        ]
          ? R
          : never
      ) => {
        if (type === 'hashchange') {
          throw new Error('hashchange error');
        }
        origAddEventListener.call(window, type, ...args);
      }) as typeof window.addEventListener;

      const cleanup = observeNavigations(recordCallback, diag);
      cleanup();

      expect(diag.getErrorLogs()).to.include(
        'Failed to setup hashchange listener',
      );

      window.addEventListener = origAddEventListener;
      restoreNavigationAPI(savedNavigationAPI);
    });
  });
});
