import type { Instrumentation } from '@opentelemetry/instrumentation';
import {
  GlobalExceptionInstrumentation,
  SpanSessionBrowserActivityInstrumentation,
  SpanSessionOnLoadInstrumentation,
  SpanSessionTimeoutInstrumentation,
  SpanSessionVisibilityInstrumentation,
  WebVitalsInstrumentation,
  ClicksInstrumentation,
  NetworkInstrumentation,
  EmbraceInstrumentationBase,
} from '../instrumentations/index.js';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import type {
  DefaultInstrumentationConfig,
  SetupDefaultInstrumentationsArgs,
} from './types.js';
import { diag } from '@opentelemetry/api';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';

export const setupDefaultInstrumentations = (
  config: DefaultInstrumentationConfig = {},
  {
    diagLogger,
    logManager,
    spanSessionManager,
  }: SetupDefaultInstrumentationsArgs = {
    diagLogger: diag.createComponentLogger({
      namespace: 'embrace-sdk',
    }),
  }
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

  if (!config.omit?.has('@opentelemetry/instrumentation-document-load')) {
    instrumentations.push(
      new DocumentLoadInstrumentation(
        config['@opentelemetry/instrumentation-document-load']
      )
    );
  }

  if (
    config['@opentelemetry/instrumentation-fetch'] ||
    config['@opentelemetry/instrumentation-xml-http-request'] ||
    config.omit?.has('@opentelemetry/instrumentation-fetch') ||
    config.omit?.has('@opentelemetry/instrumentation-xml-http-request')
  ) {
    diagLogger.warn(
      'configuration for "@opentelemetry/instrumentation-fetch" and "@opentelemetry/instrumentation-xml-http-request" are deprecated, please use "network" instead '
    );
  }

  if (
    !config.omit?.has('@opentelemetry/instrumentation-fetch') &&
    !config.omit?.has('@opentelemetry/instrumentation-xml-http-request') &&
    !config.omit?.has('network')
  ) {
    instrumentations.push(
      new NetworkInstrumentation({
        ...config['network'],
      })
    );
    instrumentations.push(
      new FetchInstrumentation({
        ...config['network'],
      })
    );
    instrumentations.push(
      new XMLHttpRequestInstrumentation({
        ...config['network'],
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
