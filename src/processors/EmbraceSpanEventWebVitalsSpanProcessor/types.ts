import { type TimedEvent } from '@opentelemetry/sdk-trace-web';
import {
  EMB_WEB_VITALS_PREFIX,
  WEB_VITALS,
} from '../../instrumentations/index.js';
import { Attributes } from '@opentelemetry/api';

export interface EmbraceSpanEventWebViewInfo extends TimedEvent {
  time_unix_nano: number; // nanoseconds since epoc time
  attributes: Attributes & {
    name: WEB_VITALS_IDS;
  };
}

export const isWebViewSpanEvent = (
  spanEvent: EmbraceSpanEventWebViewInfo | TimedEvent
): spanEvent is EmbraceSpanEventWebViewInfo => {
  return spanEvent.name.startsWith(EMB_WEB_VITALS_PREFIX);
};

export type WEB_VITALS_IDS = (typeof WEB_VITALS)[number];
