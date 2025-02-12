import { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import {
  WEB_VITAL_SPAN_EVENT_NAME,
  KEY_EMB_WEB_VITAL_ID,
  KEY_EMB_WEB_VITAL_NAME,
  KEY_EMB_WEB_VITAL_NAVIGATION_TYPE,
  KEY_EMB_WEB_VITAL_RATING,
  KEY_EMB_WEB_VITAL_VALUE,
  KEY_EMB_WEB_VITAL_DELTA,
  KEY_EMB_TIME_UNIX_NANO,
  BILLION,
} from './constants.js';
import { EmbraceSpanEventWebViewInfo, isWebViewSpanEvent } from './types.js';
import { ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';

/**
 Embrace's API uses a proprietary format to ingest web vital data. This processor converts span events to such format
 */
export class EmbraceSpanEventWebVitalsSpanProcessor implements SpanProcessor {
  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    span.events.forEach(event => {
      if (isWebViewSpanEvent(event)) {
        event.name = WEB_VITAL_SPAN_EVENT_NAME;

        // event.time[0] has seconds, so multiply by 1 billion to get nanoseconds, then add the nanoseconds part
        // NOTE: time is actually the time when the web vitals instrumentation reported a change in the metric, not what
        // EmbraceSpanEventWebViewInfo expects, which is the start time of the measurement. We'll set the start time to
        // comply with the expected format until the BE accepts a better format
        const time = event.time[0] * BILLION + event.time[1];
        (event as EmbraceSpanEventWebViewInfo)[KEY_EMB_TIME_UNIX_NANO] = time;

        event.attributes[KEY_EMB_TYPE] = EMB_TYPES.WebVital;

        // TODO should we directly create the event using these names instead of mapping all of them here?
        event.attributes[KEY_EMB_WEB_VITAL_ID] = event.attributes.id;
        event.attributes[ATTR_URL_FULL] = event.attributes.pageURL;
        event.attributes[KEY_EMB_WEB_VITAL_NAME] = event.attributes.name;
        event.attributes[KEY_EMB_WEB_VITAL_NAVIGATION_TYPE] =
          event.attributes.navigationType;
        event.attributes[KEY_EMB_WEB_VITAL_RATING] = event.attributes.rating;
        event.attributes[KEY_EMB_WEB_VITAL_VALUE] = event.attributes.value;
        event.attributes[KEY_EMB_WEB_VITAL_DELTA] = event.attributes.delta;
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
