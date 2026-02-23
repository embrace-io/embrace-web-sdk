/*
 * Adapted from OpenTelemetry document-load instrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-document-load
 */

export { DocumentLoadInstrumentation } from './DocumentLoadInstrumentation.ts';
export { AttributeNames } from './enums/AttributeNames.ts';
export type {
  DocumentLoadCustomAttributeFunction,
  DocumentLoadInstrumentationConfig,
  ResourceFetchCustomAttributeFunction,
} from './types.ts';
