import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.js';
import { mockIResource } from './IResource.js';

export const mockSpan: ReadableSpan = {
  name: 'mock span',
  kind: 1,
  spanContext: () => ({
    traceId: '1',
    spanId: '2',
    traceFlags: 1,
  }),
  startTime: [0, 0],
  endTime: [0, 0],
  status: { code: 1 },
  attributes: {},
  links: [],
  events: [],
  duration: [0, 0],
  ended: true,
  resource: mockIResource,
  instrumentationLibrary: { name: 'test', version: '1' },
  droppedAttributesCount: 0,
  droppedEventsCount: 0,
  droppedLinksCount: 0,
};

export const mockSessionSpan: ReadableSpan = {
  ...mockSpan,
  name: 'mock session span',
  attributes: {
    [KEY_EMB_TYPE]: EMB_TYPES.Session,
  },
};
