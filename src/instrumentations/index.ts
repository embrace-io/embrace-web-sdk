export {
  EmbraceSpanSessionManager,
  SpanSessionVisibilityInstrumentation,
  SessionSpanAttributes,
  SessionSpan,
} from './session/index.js';
export { GlobalExceptionInstrumentation } from './exceptions/index.js';
export { ClicksInstrumentation } from './clicks/index.js';
export {
  WebVitalsInstrumentation,
  EMB_WEB_VITALS_PREFIX,
  METER_NAME,
  CORE_WEB_VITALS,
  NOT_CORE_WEB_VITALS,
  WEB_VITALS,
  WEB_VITALS_ID_TO_LISTENER,
} from './web-vitals/index.js';
