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
  ClicksInstrumentation,
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

type OptionalInstrumentations =
  | 'exception'
  | 'click'
  | 'web-vital'
  | '@opentelemetry/instrumentation-document-load'
  | '@opentelemetry/instrumentation-fetch'
  | '@opentelemetry/instrumentation-xml-http-request';

export interface DefaultInstrumenationConfig {
  omit?: Set<OptionalInstrumentations>;
  exception?: GlobalExceptionInstrumentationArgs;
  click?: ClicksInstrumentationArgs;
  'web-vital'?: WebVitalsInstrumentationArgs;
  'session-on-load'?: SpanSessionOnLoadInstrumentationArgs;
  'session-visibility'?: SpanSessionVisibilityInstrumentationArgs;
  'session-activity'?: SpanSessionBrowserActivityInstrumentationArgs;
  'session-timeout'?: SpanSessionTimeoutInstrumentationArgs;
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

export const setupDefaultInstrumentations = (
  config: DefaultInstrumenationConfig = {}
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

  if (!config.omit?.has('@opentelemetry/instrumentation-fetch')) {
    instrumentations.push(
      new FetchInstrumentation(config['@opentelemetry/instrumentation-fetch'])
    );
  }

  if (!config.omit?.has('@opentelemetry/instrumentation-xml-http-request')) {
    instrumentations.push(
      new XMLHttpRequestInstrumentation(
        config['@opentelemetry/instrumentation-xml-http-request']
      )
    );
  }

  return instrumentations;
};
