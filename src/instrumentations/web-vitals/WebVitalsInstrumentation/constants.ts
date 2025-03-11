import {
  onCLS,
  onFCP,
  onFID,
  onINP,
  onLCP,
  onTTFB
} from 'web-vitals/attribution';

export const EMB_WEB_VITALS_PREFIX = 'emb-web-vitals';
export const METER_NAME = `${EMB_WEB_VITALS_PREFIX}-meter` as const;
export const CORE_WEB_VITALS = ['CLS', 'INP', 'LCP'] as const;
export const NOT_CORE_WEB_VITALS = ['FCP', 'FID', 'TTFB'] as const;
export const WEB_VITALS = [...CORE_WEB_VITALS, ...NOT_CORE_WEB_VITALS] as const;
export const WEB_VITALS_ID_TO_LISTENER = {
  CLS: onCLS,
  FCP: onFCP,
  FID: onFID,
  LCP: onLCP,
  INP: onINP,
  TTFB: onTTFB
} as const;
