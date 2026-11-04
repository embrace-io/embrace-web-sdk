import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import * as chai from 'chai';
import * as sinon from 'sinon';
import {
  ElementTimingInstrumentation,
  EmptyRootInstrumentation,
  LoafInstrumentation,
  SoftNavigationPerformanceInstrumentation,
} from '../instrumentations/index.ts';
import { setupDefaultInstrumentations } from './setupDefaultInstrumentations.ts';
import type { DefaultInstrumentationConfig } from './types.ts';

const { expect } = chai;

type DefaultInstrumentations = ReturnType<typeof setupDefaultInstrumentations>;

const getFetch = (instrumentations: DefaultInstrumentations) =>
  instrumentations.find(
    (i) => i instanceof FetchInstrumentation,
  ) as FetchInstrumentation;

// Fetch and XHR are checked by config.enabled, not isEnabled(): registerInstrumentations
// enables only instrumentations whose config reports them disabled, so a true flag would skip them.
const isEnabled = (instrumentation: DefaultInstrumentations[number]) =>
  'getConfig' in instrumentation
    ? instrumentation.getConfig().enabled
    : instrumentation.isEnabled();

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
        {},
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
        {},
      );

      expect(getXHR(instrumentations).getConfig().ignoreUrls).to.deep.equal([
        /network-pattern/,
        /xhr-pattern/,
      ]);
    });

    it('uses only network.ignoreUrls when no instrumentation ignoreUrls are set', () => {
      const instrumentations = setupDefaultInstrumentations(
        { network: { ignoreUrls: [/network-only/] } },
        {},
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
        {},
      );

      expect(getFetch(instrumentations).getConfig().ignoreUrls).to.deep.equal([
        /fetch-only/,
      ]);
      expect(getXHR(instrumentations).getConfig().ignoreUrls).to.deep.equal([
        /xhr-only/,
      ]);
    });

    it('produces an empty ignoreUrls when no ignoreUrls are set', () => {
      const instrumentations = setupDefaultInstrumentations({}, {});

      expect(getFetch(instrumentations).getConfig().ignoreUrls).to.deep.equal(
        [],
      );
      expect(getXHR(instrumentations).getConfig().ignoreUrls).to.deep.equal([]);
    });
  });

  describe('empty-root opt-in', () => {
    it('omits EmptyRootInstrumentation by default', () => {
      const instrumentations = setupDefaultInstrumentations({}, {});

      expect(
        instrumentations.some((i) => i instanceof EmptyRootInstrumentation),
      ).to.equal(false);
    });

    it('includes EmptyRootInstrumentation when opted in', () => {
      const instrumentations = setupDefaultInstrumentations(
        { 'empty-root': { rootNode: document.body } },
        {},
      );

      expect(
        instrumentations.some((i) => i instanceof EmptyRootInstrumentation),
      ).to.equal(true);
    });
  });

  describe('browser support', () => {
    let originalPerformanceObserver: typeof globalThis.PerformanceObserver;

    const stubSupportedEntryTypes = (supportedEntryTypes: string[]) => {
      (globalThis as Record<string, unknown>)['PerformanceObserver'] = class {
        public static supportedEntryTypes = supportedEntryTypes;
      };
    };

    const hostWithNavigation = {
      navigation: {} as Navigation,
      location: { href: 'https://example.com', pathname: '/' },
    };
    const hostWithoutNavigation = {
      location: { href: 'https://example.com', pathname: '/' },
    };

    const hasInstance = (
      instrumentations: DefaultInstrumentations,
      type: abstract new (...args: never[]) => unknown,
    ) => instrumentations.some((i) => i instanceof type);

    beforeEach(() => {
      originalPerformanceObserver = globalThis.PerformanceObserver;
    });

    afterEach(() => {
      (globalThis as Record<string, unknown>)['PerformanceObserver'] =
        originalPerformanceObserver;
    });

    it('skips loaf, element-timing and soft-navigation-performance when the browser supports none of their entry types', () => {
      stubSupportedEntryTypes([]);

      const instrumentations = setupDefaultInstrumentations(
        {
          'soft-navigation-performance': { navigationHost: hostWithNavigation },
        },
        {},
      );

      expect(hasInstance(instrumentations, LoafInstrumentation)).to.equal(
        false,
      );
      expect(
        hasInstance(instrumentations, ElementTimingInstrumentation),
      ).to.equal(false);
      expect(
        hasInstance(instrumentations, SoftNavigationPerformanceInstrumentation),
      ).to.equal(false);
    });

    it('builds loaf, element-timing and soft-navigation-performance when the browser supports their entry types', () => {
      stubSupportedEntryTypes([
        'long-animation-frame',
        'element',
        'soft-navigation',
      ]);

      const instrumentations = setupDefaultInstrumentations({}, {});

      expect(hasInstance(instrumentations, LoafInstrumentation)).to.equal(true);
      expect(
        hasInstance(instrumentations, ElementTimingInstrumentation),
      ).to.equal(true);
      expect(
        hasInstance(instrumentations, SoftNavigationPerformanceInstrumentation),
      ).to.equal(true);
    });

    // Without native soft-navigation entries, support depends on the Navigation
    // API of the host the instance will use, not on window's.
    it('skips soft-navigation-performance when the configured host has no Navigation API', () => {
      stubSupportedEntryTypes(['event']);

      const instrumentations = setupDefaultInstrumentations(
        {
          'soft-navigation-performance': {
            navigationHost: hostWithoutNavigation,
          },
        },
        {},
      );

      expect(
        hasInstance(instrumentations, SoftNavigationPerformanceInstrumentation),
      ).to.equal(false);
    });

    it('builds soft-navigation-performance when the configured host has the Navigation API', () => {
      stubSupportedEntryTypes(['event']);

      const instrumentations = setupDefaultInstrumentations(
        {
          'soft-navigation-performance': { navigationHost: hostWithNavigation },
        },
        {},
      );

      expect(
        hasInstance(instrumentations, SoftNavigationPerformanceInstrumentation),
      ).to.equal(true);
    });
  });

  describe('enabling', () => {
    /*
     * initSDK passes the providers and the SDK's managers to enable() only
     * after an instrumentation is built. Anything enabled on return would emit
     * its start-up telemetry to no-op tracers and loggers, and document-load,
     * server-timing and dom-state latch that one collection and never retry.
     */
    it('returns instrumentations that are not enabled yet', () => {
      const instrumentations = setupDefaultInstrumentations(
        { 'empty-root': { rootNode: document.body } },
        {},
      );

      expect(instrumentations).to.have.length.greaterThan(0);
      for (const instrumentation of instrumentations) {
        expect(
          isEnabled(instrumentation),
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
      const instrumentations = setupDefaultInstrumentations(untypedConfig, {});

      for (const instrumentation of instrumentations) {
        expect(
          isEnabled(instrumentation),
          `${instrumentation.instrumentationName} should not be enabled yet`,
        ).to.equal(false);
      }
    });

    // Pins the upstream rule the constructed-disabled fetch and XHR depend on:
    // registerInstrumentations calls enable() on every instrumentation whose
    // config still reports it disabled.
    it('has fetch and XHR enabled exactly once by registerInstrumentations', () => {
      const all = setupDefaultInstrumentations({}, {});
      const instrumentations = [getFetch(all), getXHR(all)];
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
