import type { DiagLogger } from '@opentelemetry/api';
import type { NamespacedStorage } from '../utils/index.ts';

export interface GetWebSDKResourceArgs {
  diagLogger: DiagLogger;
  appVersion: string;
  tabStorage: NamespacedStorage;
}

// The Network Information API is Chromium-only and unstandardized, so it is absent from
// TypeScript's DOM lib; declared locally rather than pulled from an @types package.
export interface NetworkInformation {
  readonly effectiveType?: string;
}

export interface NavigatorWithExtensions extends Navigator {
  readonly connection?: NetworkInformation;
  readonly deviceMemory?: number;
}
