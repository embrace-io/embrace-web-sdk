import type { DiagLogger } from '@opentelemetry/api';
import type { SafeStorageLike } from '../utils/index.ts';

export interface GetWebSDKResourceArgs {
  diagLogger: DiagLogger;
  appVersion: string;
  pageSessionStorage: SafeStorageLike;
}
