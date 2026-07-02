import type { DynamicSDKConfig } from '../../sdk/types.ts';

export const DEFAULT_CONFIG: DynamicSDKConfig = {
  samplingPct: 100,
  networkSpansForwardingThreshold: 0,
};

export const LOCAL_STORAGE_REMOTE_CONFIG_KEY = 'embrace_remote_config';
