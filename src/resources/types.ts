import type { DiagLogger } from '@opentelemetry/api';

export interface GetWebSDKResourceArgs {
  diagLogger: DiagLogger;
  appVersion?: string;
  bundleID?: string;
  pageSessionStorage: Storage;
}
