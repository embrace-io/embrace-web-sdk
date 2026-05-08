import type { DiagLogger } from '@opentelemetry/api';
import type { EmbraceStorage } from '../utils/index.ts';

export interface GetWebSDKResourceArgs {
  diagLogger: DiagLogger;
  appVersion: string;
  pageSessionStorage: EmbraceStorage;
}
