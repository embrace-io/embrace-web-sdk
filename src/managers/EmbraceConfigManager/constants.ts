import type { DynamicSDKConfig } from '../../sdk/index.js';

export const DEFAULT_CONFIG: DynamicSDKConfig = {
  samplingPct: 100,
  networkSpansForwardingThreshold: 0,
};

export const LOCAL_STORAGE_REMOTE_CONFIG_KEY = 'embrace_remote_config';
