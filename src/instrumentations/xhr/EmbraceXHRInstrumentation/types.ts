import type { XMLHttpRequestInstrumentationConfig } from '@opentelemetry/instrumentation-xml-http-request';

export type EmbraceXHRInstrumentationArgs =
  XMLHttpRequestInstrumentationConfig & {
    omitIfAlreadyPatched?: boolean;
  };
