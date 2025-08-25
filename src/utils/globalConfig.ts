export type GlobalConfig = {
  _EmbraceFileBundleIDs?: Record<string, string>;
};

export const GLOBAL_CONFIG = globalThis as unknown as GlobalConfig;
