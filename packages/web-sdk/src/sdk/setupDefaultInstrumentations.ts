import type { Instrumentation } from '@opentelemetry/instrumentation';
import {
  ClicksInstrumentation,
  DocumentLoadInstrumentation,
  EmbraceFetchInstrumentation,
  EmbraceInstrumentationBase,
  EmbraceXHRInstrumentation,
  EmptyRootInstrumentation,
  GlobalExceptionInstrumentation,
  LoafInstrumentation,
  SpanSessionBrowserActivityInstrumentation,
  SpanSessionOnLoadInstrumentation,
  SpanSessionTimeoutInstrumentation,
  SpanSessionVisibilityInstrumentation,
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
    featureManager,
    logManager,
    spanSessionManager,
    embraceSpanProcessor,
    pageManager,
    limitManager,
  }: SetupDefaultInstrumentationsArgs,
): Instrumentation[] => {
  /*
    These instrumentations are core to managing the session lifecycle and so are not optional
   */
  const instrumentations: Instrumentation[] = [
    new SpanSessionOnLoadInstrumentation(config['session-on-load']),
    new SpanSessionVisibilityInstrumentation(
      config['session-visibility'],
      featureManager,
      embraceSpanProcessor,
    ),
    new SpanSessionBrowserActivityInstrumentation(config['session-activity']),
    new SpanSessionTimeoutInstrumentation(config['session-timeout']),
  ];

  if (!config.omit?.has('exception')) {
    instrumentations.push(
      new GlobalExceptionInstrumentation(config['exception']),
    );
  }

  if (!config.omit?.has('click')) {
    instrumentations.push(new ClicksInstrumentation(config['click']));
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

  if (!config.omit?.has('document-load')) {
    instrumentations.push(
      new DocumentLoadInstrumentation(config['document-load']),
    );
  }

  if (!config.omit?.has('@opentelemetry/instrumentation-fetch')) {
    instrumentations.push(
      new EmbraceFetchInstrumentation({
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
      new EmbraceXHRInstrumentation({
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
      if (spanSessionManager) {
        instrumentation.setSessionManager(spanSessionManager);
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
