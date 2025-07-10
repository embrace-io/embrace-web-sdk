import type { RemoteConfig } from './types.js';

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  threshold: 1,
};

export const LOCAL_STORAGE_REMOTE_CONFIG_KEY = 'embrace_remote_config';
export const LOCAL_STORAGE_ETAG_KEY = 'embrace_remote_config_etag';
