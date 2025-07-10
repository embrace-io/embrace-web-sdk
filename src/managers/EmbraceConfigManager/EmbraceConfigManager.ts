import type {
  RemoteConfig,
  ConfigManager,
  RemoteConfigManagerArgs,
} from './types.js';
import { getConfigURL } from './utils.js';
import { diag } from '@opentelemetry/api';
import type { DiagLogger } from '@opentelemetry/api';
import {
  DEFAULT_CONFIG,
  LOCAL_STORAGE_ETAG_KEY,
  LOCAL_STORAGE_REMOTE_CONFIG_KEY,
} from './constants.js';
import type { SDKConfig } from '../../common/index.js';

export class EmbraceConfigManager implements ConfigManager {
  // Set to null if appID is not provided, in that case only rely on local config
  private readonly _remoteConfigURL: string | null = null;
  private readonly _diag: DiagLogger;
  private readonly _storage: Storage;

  private _sdkConfig: SDKConfig;
  private _etag: string | null = null;

  public constructor({
    appID,
    appVersion,
    deviceId,
    diag: diagParam = diag.createComponentLogger({
      namespace: 'embrace-registry',
    }),
    storage = localStorage,
    // Allow users to provide a default config
    defaultConfig = {},
  }: RemoteConfigManagerArgs = {}) {
    if (appID && appVersion && deviceId) {
      this._remoteConfigURL = getConfigURL(appID, {
        appVersion,
        deviceId,
        // TODO: Replace with actual OS version once we start capturing it
        osVersion: '1',
      });
    }

    this._diag = diagParam;
    this._storage = storage;

    const storedRemoteConfig = this._getRemoteConfigFromStorage();
    this._restoredEtagFromStorage();

    this._sdkConfig = {
      // Merge the default config with any user-provided defaults
      // making sure user-provided values take precedence
      ...DEFAULT_CONFIG,
      ...defaultConfig,
      // Stored remote config values will override both defaults and user-provided defaults
      ...(storedRemoteConfig || {}),
    };
  }

  public getConfig(): SDKConfig {
    return this._sdkConfig;
  }

  // No-op if not sending data to embrace
  public async refreshRemoteConfig(): Promise<void> {
    if (!this._remoteConfigURL) {
      return;
    }

    try {
      const remoteConfig = await this._fetchRemoteConfig(this._remoteConfigURL);

      this._sdkConfig = {
        threshold: remoteConfig.threshold / 100,
      };

      this._storage.setItem(
        LOCAL_STORAGE_REMOTE_CONFIG_KEY,
        JSON.stringify(this._sdkConfig)
      );
    } catch (error: unknown) {
      this._diag.warn(
        `Failed to refresh remote config: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private _getRemoteConfigFromStorage(): SDKConfig | null {
    try {
      const configString = this._storage.getItem(
        LOCAL_STORAGE_REMOTE_CONFIG_KEY
      );

      if (configString) {
        return JSON.parse(configString) as SDKConfig;
      }

      return null;
    } catch (error) {
      this._diag.warn(
        `Failed to parse remote config from storage: ${error instanceof Error ? error.message : String(error)}`
      );

      return null;
    }
  }

  private _restoredEtagFromStorage() {
    try {
      this._etag = this._storage.getItem(LOCAL_STORAGE_ETAG_KEY);
    } catch (error) {
      this._diag.warn(
        `Failed to retrieve ETag from storage: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private _setEtagToStorage(etag: string) {
    try {
      this._storage.setItem(LOCAL_STORAGE_ETAG_KEY, etag);
      this._etag = etag;
    } catch (error) {
      this._diag.warn(
        `Failed to set ETag in storage: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async _fetchRemoteConfig(url: string): Promise<RemoteConfig> {
    const response = await fetch(url, {
      headers: this._etag ? { 'If-None-Match': this._etag } : {},
    });

    if (!response.ok) {
      this._diag.warn(
        `Failed to fetch remote config from ${url}: ${response.statusText}`
      );
    }

    const etag = response.headers.get('etag') || null;

    if (etag && etag !== this._etag) {
      this._setEtagToStorage(etag);
      this._etag = etag;
    }

    return (await response.json()) as RemoteConfig;
  }
}
