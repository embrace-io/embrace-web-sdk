import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import * as chai from 'chai';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbracePageManager,
} from '../managers/index.ts';
import { setupDefaultInstrumentations } from './setupDefaultInstrumentations.ts';
import type { SetupDefaultInstrumentationsArgs } from './types.ts';

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
});
