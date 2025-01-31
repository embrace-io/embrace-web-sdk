import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import {
  BILLION,
  KEY_EMB_TIME_UNIX_NANO,
  KEY_EMB_WEB_VIEW_URL,
  KEY_EMB_WEB_VIEW_VITALS,
  WEB_VIEW_INFO_SPAN_EVENT_NAME,
} from './constants.js';
import {
  EmbraceSpanEventWebViewInfo,
  EmbraceWebVitalsInfo,
  isWebViewSpanEvent,
} from './types.js';

/**
 Embrace's API uses a proprietary format to ingest web vital data. This processor converts span events to such format
 */
export class EmbraceSpanEventWebVitalsSpanProcessor implements SpanProcessor {
  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    span.events.forEach(event => {
      if (isWebViewSpanEvent(event)) {
        event.name = WEB_VIEW_INFO_SPAN_EVENT_NAME;
        // event.time[0] has seconds, so multiply by 1 billion to get nanoseconds, then add the nanoseconds part
        // NOTE: time is actually the time when the web vitals instrumentation reported a change in the metric, not what
        // EmbraceSpanEventWebViewInfo expects, which is the start time of the measurement. We'll set the start time to
        // comply with the expected format until the BE accepts a better format
        const time = event.time[0] * BILLION + event.time[1];
        (event as EmbraceSpanEventWebViewInfo)[KEY_EMB_TIME_UNIX_NANO] = time;
        event.attributes[KEY_EMB_TYPE] = EMB_TYPES.WebViewInfo;
        event.attributes[KEY_EMB_WEB_VIEW_URL] = event.attributes.pageURL;
        const webVitalsInfo: EmbraceWebVitalsInfo = {
          t: event.attributes.name,
          n: event.name,
          // NOTE: time is actually the time when the web vitals instrumentation reported a change in the metric, not what
          // EmbraceSpanEventWebViewInfo expects, which is the start time of the measurement. We'll set the start time to
          // comply with the expected format until the BE accepts a better format. This is also why `d` is 0
          st: time,
          d: 0,
          s: Number(event.attributes.value),
          p: event.attributes,
        };
        event.attributes[KEY_EMB_WEB_VIEW_VITALS] = JSON.stringify([
          webVitalsInfo,
        ]);
      }
    });
  }

  forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
