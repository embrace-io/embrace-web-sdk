import type { DiagLogger } from '@opentelemetry/api';
import type { NamespacedStorage } from '../utils/index.ts';

export interface GetWebSDKResourceArgs {
  diagLogger: DiagLogger;
  appVersion: string;
  pageSessionStorage: NamespacedStorage;
}
