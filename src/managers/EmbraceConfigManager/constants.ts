import type { SDKConfig } from '../../common/index.js';

export const DEFAULT_CONFIG: SDKConfig = {
  threshold: 1,
};

export const LOCAL_STORAGE_REMOTE_CONFIG_KEY = 'embrace_remote_config';
export const LOCAL_STORAGE_ETAG_KEY = 'embrace_remote_config_etag';
