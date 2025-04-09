import type { Instrumentation } from '@opentelemetry/instrumentation';
import {
  GlobalExceptionInstrumentation,
  SpanSessionBrowserActivityInstrumentation,
  SpanSessionOnLoadInstrumentation,
  SpanSessionTimeoutInstrumentation,
  SpanSessionVisibilityInstrumentation,
  WebVitalsInstrumentation,
  type WebVitalsInstrumentationArgs,
  type GlobalExceptionInstrumentationArgs,
  type SpanSessionTimeoutInstrumentationArgs,
  type SpanSessionBrowserActivityInstrumentationArgs,
  type SpanSessionVisibilityInstrumentationArgs,
  type SpanSessionOnLoadInstrumentationArgs,
  type ClicksInstrumentationArgs,
} from '../instrumentations/index.js';
import {
  DocumentLoadInstrumentation,
  type DocumentLoadInstrumentationConfig,
} from '@opentelemetry/instrumentation-document-load';
import {
  FetchInstrumentation,
  type FetchInstrumentationConfig,
} from '@opentelemetry/instrumentation-fetch';
import {
  XMLHttpRequestInstrumentation,
  type XMLHttpRequestInstrumentationConfig,
} from '@opentelemetry/instrumentation-xml-http-request';

type AvailableInstrumentations =
  | 'session-on-load'
  | 'session-visibility'
  | 'session-activity'
  | 'session-timeout'
  | 'exception'
  | 'click'
  | 'web-vital'
  | '@opentelemetry/instrumentation-document-load'
  | '@opentelemetry/instrumentation-fetch'
  | '@opentelemetry/instrumentation-xml-http-request';

interface DefaultInstrumenationConfig {
  omit: Set<AvailableInstrumentations>;
  'session-on-load'?: SpanSessionOnLoadInstrumentationArgs;
  'session-visibility'?: SpanSessionVisibilityInstrumentationArgs;
  'session-activity'?: SpanSessionBrowserActivityInstrumentationArgs;
  'session-timeout'?: SpanSessionTimeoutInstrumentationArgs;
  exception?: GlobalExceptionInstrumentationArgs;
  click?: ClicksInstrumentationArgs;
  'web-vital'?: WebVitalsInstrumentationArgs;
  /*
    Remove 'enabled' from the accepted config for the @opentelemetry instrumentations. This parameter is misleading
    since we are going to call `registerInstrumentations` for every instrumentation we include here even if their
    config has enabled=false. Instead, use `omit` to specify which default instrumentations should be turned off.
   */
  '@opentelemetry/instrumentation-document-load'?: Omit<
    DocumentLoadInstrumentationConfig,
    'enabled'
  >;
  '@opentelemetry/instrumentation-fetch'?: Omit<
    FetchInstrumentationConfig,
    'enabled'
  >;
  '@opentelemetry/instrumentation-xml-http-request'?: Omit<
    XMLHttpRequestInstrumentationConfig,
    'enabled'
  >;
}

export const getDefaultInstrumentations = (
  config: DefaultInstrumenationConfig = { omit: new Set() }
): Instrumentation[] => {
  const instrumentations = [];

  if (!config.omit.has('session-on-load')) {
    instrumentations.push(
      new SpanSessionOnLoadInstrumentation(config['session-on-load'])
    );
  }

  if (!config.omit.has('session-visibility')) {
    instrumentations.push(
      new SpanSessionVisibilityInstrumentation(config['session-visibility'])
    );
  }

  if (!config.omit.has('session-activity')) {
    instrumentations.push(
      new SpanSessionBrowserActivityInstrumentation(config['session-activity'])
    );
  }

  if (!config.omit.has('session-timeout')) {
    instrumentations.push(
      new SpanSessionTimeoutInstrumentation(config['session-timeout'])
    );
  }

  if (!config.omit.has('exception')) {
    instrumentations.push(
      new GlobalExceptionInstrumentation(config['exception'])
    );
  }

  if (!config.omit.has('click')) {
    instrumentations.push(new WebVitalsInstrumentation(config['click']));
  }

  if (!config.omit.has('web-vital')) {
    instrumentations.push(new WebVitalsInstrumentation(config['web-vital']));
  }

  if (!config.omit.has('@opentelemetry/instrumentation-document-load')) {
    instrumentations.push(
      new DocumentLoadInstrumentation(
        config['@opentelemetry/instrumentation-document-load']
      )
    );
  }

  if (!config.omit.has('@opentelemetry/instrumentation-fetch')) {
    instrumentations.push(
      new FetchInstrumentation(config['@opentelemetry/instrumentation-fetch'])
    );
  }

  if (!config.omit.has('@opentelemetry/instrumentation-xml-http-request')) {
    instrumentations.push(
      new XMLHttpRequestInstrumentation(
        config['@opentelemetry/instrumentation-xml-http-request']
      )
    );
  }

  return instrumentations;
};
