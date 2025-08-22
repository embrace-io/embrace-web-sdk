import type { DiagLogger } from '@opentelemetry/api';

export interface GetWebSDKResourceArgs {
  diagLogger: DiagLogger;
  appVersion?: string;
  pageSessionStorage: Storage;
}
