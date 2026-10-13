import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import * as chai from 'chai';
import * as sinon from 'sinon';
import type { LogManager } from '../api-logs/index.ts';
import {
  EmbraceInstrumentationBase,
  EmptyRootInstrumentation,
} from '../instrumentations/index.ts';
import type { UserSessionManagerInternal } from '../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbracePageManager,
} from '../managers/index.ts';
import { setupDefaultInstrumentations } from './setupDefaultInstrumentations.ts';
import type {
  DefaultInstrumentationConfig,
  SetupDefaultInstrumentationsArgs,
} from './types.ts';

const { expect } = chai;

type DefaultInstrumentations = ReturnType<typeof setupDefaultInstrumentations>;

const makeSetupArgs = (): SetupDefaultInstrumentationsArgs => ({
  pageManager: new EmbracePageManager(),
  limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
});

const getFetch = (instrumentations: DefaultInstrumentations) =>
  instrumentations.find(
    (i) => i instanceof FetchInstrumentation,
  ) as FetchInstrumentation;

const getXHR = (instrumentations: DefaultInstrumentations) =>
  instrumentations.find(
    (i) => i instanceof XMLHttpRequestInstrumentation,
  ) as XMLHttpRequestInstrumentation;

describe('setupDefaultInstrumentations', () => {
  describe('ignoreUrls merging', () => {
    it('merges network.ignoreUrls and fetch ignoreUrls', () => {
      const instrumentations = setupDefaultInstrumentations(
        {
          network: { ignoreUrls: [/network-pattern/] },
          '@opentelemetry/instrumentation-fetch': {
            ignoreUrls: [/fetch-pattern/],
          },
        },
        makeSetupArgs(),
      );

      expect(getFetch(instrumentations).getConfig().ignoreUrls).to.deep.equal([
        /network-pattern/,
        /fetch-pattern/,
      ]);
    });

    it('merges network.ignoreUrls and xhr ignoreUrls', () => {
      const instrumentations = setupDefaultInstrumentations(
        {
          network: { ignoreUrls: [/network-pattern/] },
          '@opentelemetry/instrumentation-xml-http-request': {
            ignoreUrls: [/xhr-pattern/],
          },
        },
        makeSetupArgs(),
      );

      expect(getXHR(instrumentations).getConfig().ignoreUrls).to.deep.equal([
        /network-pattern/,
        /xhr-pattern/,
      ]);
    });

    it('uses only network.ignoreUrls when no instrumentation ignoreUrls are set', () => {
      const instrumentations = setupDefaultInstrumentations(
        { network: { ignoreUrls: [/network-only/] } },
        makeSetupArgs(),
      );

      expect(getFetch(instrumentations).getConfig().ignoreUrls).to.deep.equal([
        /network-only/,
      ]);
      expect(getXHR(instrumentations).getConfig().ignoreUrls).to.deep.equal([
        /network-only/,
      ]);
    });

    it('uses only instrumentation ignoreUrls when no network.ignoreUrls are set', () => {
      const instrumentations = setupDefaultInstrumentations(
        {
          '@opentelemetry/instrumentation-fetch': {
            ignoreUrls: [/fetch-only/],
          },
          '@opentelemetry/instrumentation-xml-http-request': {
            ignoreUrls: [/xhr-only/],
          },
        },
        makeSetupArgs(),
      );

      expect(getFetch(instrumentations).getConfig().ignoreUrls).to.deep.equal([
        /fetch-only/,
      ]);
      expect(getXHR(instrumentations).getConfig().ignoreUrls).to.deep.equal([
        /xhr-only/,
      ]);
    });

    it('produces an empty ignoreUrls when no ignoreUrls are set', () => {
      const instrumentations = setupDefaultInstrumentations(
        {},
        makeSetupArgs(),
      );

      expect(getFetch(instrumentations).getConfig().ignoreUrls).to.deep.equal(
        [],
      );
      expect(getXHR(instrumentations).getConfig().ignoreUrls).to.deep.equal([]);
    });
  });

  describe('empty-root opt-in', () => {
    it('omits EmptyRootInstrumentation by default', () => {
      const instrumentations = setupDefaultInstrumentations(
        {},
        makeSetupArgs(),
      );

      expect(
        instrumentations.some((i) => i instanceof EmptyRootInstrumentation),
      ).to.equal(false);
    });

    it('includes EmptyRootInstrumentation when opted in', () => {
      const instrumentations = setupDefaultInstrumentations(
        { 'empty-root': { rootNode: document.body } },
        makeSetupArgs(),
      );

      expect(
        instrumentations.some((i) => i instanceof EmptyRootInstrumentation),
      ).to.equal(true);
    });
  });

  describe('manager wiring', () => {
    it('calls setUserSessionManager and setLogManager exactly once per Embrace instrumentation', () => {
      const originalSetSessionManager =
        EmbraceInstrumentationBase.prototype.setUserSessionManager;
      const originalSetLogManager =
        EmbraceInstrumentationBase.prototype.setLogManager;

      // Some instrumentations (e.g. LoafInstrumentation) call methods on the
      // session manager inside their setUserSessionManager override, so the
      // sentinel needs to be call-shaped. A Proxy that returns a no-op function
      // for every property read keeps the tested wiring independent of the
      // exact methods each instrumentation invokes during setup.
      const sentinelSession = new Proxy(
        {},
        { get: () => () => undefined },
      ) as UserSessionManagerInternal;
      const sentinelLog = new Proxy(
        {},
        { get: () => () => undefined },
      ) as LogManager;

      let sessionCalls = 0;
      let logCalls = 0;

      EmbraceInstrumentationBase.prototype.setUserSessionManager = function (
        m,
      ) {
        if (m === sentinelSession) sessionCalls++;
        originalSetSessionManager.call(this, m);
      };
      EmbraceInstrumentationBase.prototype.setLogManager = function (m) {
        if (m === sentinelLog) logCalls++;
        originalSetLogManager.call(this, m);
      };

      try {
        const instrumentations = setupDefaultInstrumentations(
          { 'empty-root': { rootNode: document.body } },
          {
            pageManager: new EmbracePageManager(),
            limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
            logManager: sentinelLog,
            userSessionManager: sentinelSession,
          },
        );

        const embraceCount = instrumentations.filter(
          (i) => i instanceof EmbraceInstrumentationBase,
        ).length;
        expect(embraceCount).to.be.greaterThan(0);
        expect(sessionCalls).to.equal(embraceCount);
        expect(logCalls).to.equal(embraceCount);
      } finally {
        EmbraceInstrumentationBase.prototype.setUserSessionManager =
          originalSetSessionManager;
        EmbraceInstrumentationBase.prototype.setLogManager =
          originalSetLogManager;
      }
    });
  });

  describe('enabling', () => {
    /*
     * Under registerGlobally: false the per-instance managers, set here after
     * construction, and the providers, set by registerInstrumentations, reach
     * an instrumentation only after it is built. Anything enabled on return
     * would emit its start-up telemetry to no-op tracers and loggers, and
     * document-load, server-timing and dom-state latch that one collection
     * and never retry.
     */
    it('returns instrumentations that are not enabled yet', () => {
      const instrumentations = setupDefaultInstrumentations(
        { 'empty-root': { rootNode: document.body } },
        makeSetupArgs(),
      );

      expect(instrumentations).to.have.length.greaterThan(0);
      for (const instrumentation of instrumentations) {
        expect(
          instrumentation.getConfig().enabled,
          `${instrumentation.instrumentationName} should not be enabled yet`,
        ).to.equal(false);
      }
    });

    // CDN callers are not type-checked, and only the spread order in
    // setupDefaultInstrumentations keeps a stray enabled: true from patching
    // fetch or XHR before the providers are attached.
    it('returns instrumentations that are not enabled yet when an untyped caller passes enabled', () => {
      const untypedConfig = {
        '@opentelemetry/instrumentation-fetch': { enabled: true },
        '@opentelemetry/instrumentation-xml-http-request': { enabled: true },
        'document-load': { enabled: true },
        'web-vital': { enabled: true },
      } as unknown as DefaultInstrumentationConfig;
      const instrumentations = setupDefaultInstrumentations(
        untypedConfig,
        makeSetupArgs(),
      );

      for (const instrumentation of instrumentations) {
        expect(
          instrumentation.getConfig().enabled,
          `${instrumentation.instrumentationName} should not be enabled yet`,
        ).to.equal(false);
      }
    });

    // Pins the upstream rule the constructed-disabled design depends on:
    // registerInstrumentations calls enable() on every instrumentation whose
    // config still reports it disabled.
    it('has every instrumentation enabled exactly once by registerInstrumentations', () => {
      const instrumentations = setupDefaultInstrumentations(
        { 'empty-root': { rootNode: document.body } },
        makeSetupArgs(),
      );
      const enableSpies = instrumentations.map((instrumentation) =>
        sinon.spy(instrumentation, 'enable'),
      );

      const unregister = registerInstrumentations({ instrumentations });
      try {
        instrumentations.forEach((instrumentation, index) => {
          expect(
            enableSpies[index].callCount,
            `${instrumentation.instrumentationName} should be enabled once`,
          ).to.equal(1);
        });
      } finally {
        unregister();
      }
    });
  });
});
