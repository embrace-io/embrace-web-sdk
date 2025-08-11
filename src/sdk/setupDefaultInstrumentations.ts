import type { Instrumentation } from '@opentelemetry/instrumentation';
import {
  ClicksInstrumentation,
  DocumentLoadInstrumentation,
  EmbraceInstrumentationBase,
  GlobalExceptionInstrumentation,
  SpanSessionBrowserActivityInstrumentation,
  SpanSessionOnLoadInstrumentation,
  SpanSessionTimeoutInstrumentation,
  SpanSessionVisibilityInstrumentation,
  WebVitalsInstrumentation,
} from '../instrumentations/index.js';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import type {
  DefaultInstrumentationConfig,
  SetupDefaultInstrumentationsArgs,
} from './types.js';

export const setupDefaultInstrumentations = (
  config: DefaultInstrumentationConfig = {},
  { logManager, spanSessionManager }: SetupDefaultInstrumentationsArgs = {}
): Instrumentation[] => {
  /*
    These instrumentations are core to managing the session lifecycle and so are not optional
   */
  const instrumentations: Instrumentation[] = [
    new SpanSessionOnLoadInstrumentation(config['session-on-load']),
    new SpanSessionVisibilityInstrumentation(config['session-visibility']),
    new SpanSessionBrowserActivityInstrumentation(config['session-activity']),
    new SpanSessionTimeoutInstrumentation(config['session-timeout']),
  ];

  if (!config.omit?.has('exception')) {
    instrumentations.push(
      new GlobalExceptionInstrumentation(config['exception'])
    );
  }

  if (!config.omit?.has('click')) {
    instrumentations.push(new ClicksInstrumentation(config['click']));
  }

  if (!config.omit?.has('web-vital')) {
    instrumentations.push(new WebVitalsInstrumentation(config['web-vital']));
  }

  if (!config.omit?.has('document-load')) {
    instrumentations.push(
      new DocumentLoadInstrumentation(config['document-load'])
    );
  }

  if (!config.omit?.has('@opentelemetry/instrumentation-fetch')) {
    instrumentations.push(
      new FetchInstrumentation({
        ...config['network'],
        ...config['@opentelemetry/instrumentation-fetch'],
      })
    );
  }

  if (!config.omit?.has('@opentelemetry/instrumentation-xml-http-request')) {
    instrumentations.push(
      new XMLHttpRequestInstrumentation({
        ...config['network'],
        ...config['@opentelemetry/instrumentation-xml-http-request'],
      })
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
    }
  }

  return instrumentations;
};
