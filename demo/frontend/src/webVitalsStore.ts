import type { CapturedLog } from '../waterfall/telemetryCapture.ts';
import {
  clearCapture,
  getCapturedLogs,
} from '../waterfall/telemetryCapture.ts';

type WebVitalReport = {
  metric: string;
  id: string;
  value: number;
  rating: string;
  navigationType: string;
  navigationId: number | undefined;
  interactionId: number | undefined;
  url: string;
  pagePath: string | undefined;
  timestampMillis: number;
};

// Hard-code the attribute keys rather than import them from the SDK so that the
// demo also tests the emitted log shape.
const WEB_VITAL_LOG_TYPE = 'ux.web_vital';
const ATTR_EMB_TYPE = 'emb.type';
const ATTR_NAME = 'browser.web_vital.name';
const ATTR_VALUE = 'browser.web_vital.value';
const ATTR_RATING = 'browser.web_vital.rating';
const ATTR_ID = 'browser.web_vital.id';
const ATTR_NAVIGATION_TYPE = 'browser.web_vital.navigation_type';
const ATTR_NAVIGATION_ID = 'browser.web_vital.navigation_id';
const ATTR_INTERACTION_ID = 'browser.web_vital.interaction_id';
const ATTR_URL_FULL = 'browser.url.full';
const ATTR_PAGE_PATH = 'emb.page.path';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

const makeReport = (log: CapturedLog): WebVitalReport | undefined => {
  const attributes = log.attributes;

  if (attributes[ATTR_EMB_TYPE] !== WEB_VITAL_LOG_TYPE) {
    return undefined;
  }

  const metric = asString(attributes[ATTR_NAME]);
  const value = asNumber(attributes[ATTR_VALUE]);
  const id = asString(attributes[ATTR_ID]);

  if (metric === undefined || value === undefined || id === undefined) {
    return undefined;
  }

  return {
    metric,
    id,
    value,
    rating: asString(attributes[ATTR_RATING]) ?? 'unknown',
    navigationType: asString(attributes[ATTR_NAVIGATION_TYPE]) ?? 'unknown',
    navigationId: asNumber(attributes[ATTR_NAVIGATION_ID]),
    interactionId: asNumber(attributes[ATTR_INTERACTION_ID]),
    url: asString(attributes[ATTR_URL_FULL]) ?? '',
    pagePath: asString(attributes[ATTR_PAGE_PATH]),
    timestampMillis: log.timeMs,
  };
};

let cachedReports: WebVitalReport[] = [];
let cachedFromCount = -1;

const getSnapshot = (): WebVitalReport[] => {
  const logs = getCapturedLogs();

  if (logs.length !== cachedFromCount) {
    const derived: WebVitalReport[] = [];
    cachedFromCount = logs.length;

    for (const log of logs) {
      const report = makeReport(log);

      if (report !== undefined) {
        derived.push(report);
      }
    }

    cachedReports = derived;
  }

  return cachedReports;
};

const clear = () => {
  clearCapture();
};

export type { WebVitalReport };
export { clear, getSnapshot };
