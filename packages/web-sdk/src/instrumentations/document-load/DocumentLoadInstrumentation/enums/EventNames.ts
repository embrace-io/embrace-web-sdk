/*
 * Adapted from OpenTelemetry document-load instrumentation
 * https://github.com/open-telemetry/opentelemetry-js-contrib/tree/cc7eff47e2e7bad7678241b766753d5bd6dbc85f/packages/instrumentation-document-load
 */

export enum EventNames {
  FIRST_PAINT = 'firstPaint',
  FIRST_CONTENTFUL_PAINT = 'firstContentfulPaint',
}
