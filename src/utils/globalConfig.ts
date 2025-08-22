export type GlobalConfig = {
  _EmbraceWebSymbolFileIDs?: Record<string, string>;
};

export const GLOBAL_CONFIG = globalThis as unknown as GlobalConfig;
