import type { DiagLogger } from '@opentelemetry/api';
import type { NamespacedStorage } from '../utils/NamespacedStorage/NamespacedStorage.ts';

export interface GetWebSDKResourceArgs {
  diagLogger: DiagLogger;
  appVersion: string;
  tabStorage: NamespacedStorage;
}
