import type { Instrumentation } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import {
  ClicksInstrumentation,
  DocumentLoadInstrumentation,
  ElementTimingInstrumentation,
  EmbraceInstrumentationBase,
  EmptyRootInstrumentation,
  FirstInteractionInstrumentation,
  GlobalExceptionInstrumentation,
  LoafInstrumentation,
  RageClickInstrumentation,
  ServerTimingInstrumentation,
  UserTimingInstrumentation,
  WebVitalsInstrumentation,
} from '../instrumentations/index.ts';
import type {
  DefaultInstrumentationConfig,
  SetupDefaultInstrumentationsArgs,
} from './types.ts';

export const setupDefaultInstrumentations = (
  config: DefaultInstrumentationConfig = {},
  {
    logManager,
    userSessionManager,
    pageManager,
    limitManager,
  }: SetupDefaultInstrumentationsArgs,
): Instrumentation[] => {
  const instrumentations: Instrumentation[] = [];

  if (!config.omit?.has('exception')) {
    instrumentations.push(
      new GlobalExceptionInstrumentation(config['exception']),
    );
  }

  if (!config.omit?.has('click')) {
    instrumentations.push(new ClicksInstrumentation(config['click']));
  }

  if (!config.omit?.has('rage-click')) {
    instrumentations.push(new RageClickInstrumentation(config['rage-click']));
  }

  if (!config.omit?.has('first-interaction')) {
    instrumentations.push(
      new FirstInteractionInstrumentation(config['first-interaction']),
    );
  }

  if (!config.omit?.has('web-vital')) {
    instrumentations.push(
      new WebVitalsInstrumentation({ ...config['web-vital'], pageManager }),
    );
  }

  if (!config.omit?.has('loaf')) {
    instrumentations.push(new LoafInstrumentation({ ...config['loaf'] }));
  }

  if (!config.omit?.has('user-timing')) {
    instrumentations.push(new UserTimingInstrumentation(config['user-timing']));
  }

  if (!config.omit?.has('element-timing')) {
    instrumentations.push(
      new ElementTimingInstrumentation({
        ...config['element-timing'],
        limitManager,
      }),
    );
  }

  if (!config.omit?.has('document-load')) {
    instrumentations.push(
      new DocumentLoadInstrumentation(config['document-load']),
    );
  }

  if (!config.omit?.has('server-timing')) {
    instrumentations.push(
      new ServerTimingInstrumentation({
        ...config['server-timing'],
        limitManager,
      }),
    );
  }

  if (!config.omit?.has('@opentelemetry/instrumentation-fetch')) {
    instrumentations.push(
      new FetchInstrumentation({
        ...config['@opentelemetry/instrumentation-fetch'],
        ignoreUrls: [
          ...(config['network']?.ignoreUrls ?? []),
          ...(config['@opentelemetry/instrumentation-fetch']?.ignoreUrls ?? []),
        ],
      }),
    );
  }

  if (!config.omit?.has('@opentelemetry/instrumentation-xml-http-request')) {
    instrumentations.push(
      new XMLHttpRequestInstrumentation({
        ...config['@opentelemetry/instrumentation-xml-http-request'],
        ignoreUrls: [
          ...(config['network']?.ignoreUrls ?? []),
          ...(config['@opentelemetry/instrumentation-xml-http-request']
            ?.ignoreUrls ?? []),
        ],
      }),
    );
  }

  if (config['empty-root']) {
    instrumentations.push(
      new EmptyRootInstrumentation({ ...config['empty-root'] }),
    );
  }

  for (const instrumentation of instrumentations) {
    if (instrumentation instanceof EmbraceInstrumentationBase) {
      if (userSessionManager) {
        instrumentation.setUserSessionManager(userSessionManager);
      }

      if (logManager) {
        instrumentation.setLogManager(logManager);
      }

      if (limitManager) {
        instrumentation.setLimitManager(limitManager);
      }
    }
  }

  return instrumentations;
};
