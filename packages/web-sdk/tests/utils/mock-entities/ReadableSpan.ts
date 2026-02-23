import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../../src/constants/index.ts';
import { mockResource } from './Resource.ts';

export const mockSpan: ReadableSpan = {
  name: 'mock span',
  kind: 1,
  spanContext: () => ({
    traceId: '1',
    spanId: '2',
    traceFlags: 1,
  }),
  startTime: [1756138003, 674399902],
  endTime: [1756138004, 499000000],
  status: { code: 1 },
  attributes: {
    'session.id': '80537B7CA8D748D88A6A9D01DE9EDA8E',
  },
  links: [],
  events: [],
  duration: [0, 0],
  ended: true,
  resource: mockResource,
  instrumentationScope: { name: 'test', version: '1' },
  droppedAttributesCount: 0,
  droppedEventsCount: 0,
  droppedLinksCount: 0,
};

export const mockNetworkRequestSpan: ReadableSpan = {
  ...mockSpan,
  attributes: {
    'emb.type': 'perf.network_request',
  },
};

export const mockSessionSpan: ReadableSpan = {
  ...mockSpan,
  name: 'mock session span',
  attributes: {
    [KEY_EMB_TYPE]: EMB_TYPES.Session,
  },
};
