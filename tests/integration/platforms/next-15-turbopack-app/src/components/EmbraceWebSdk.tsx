'use client';

import { DiagLogLevel, initSDK } from '@embrace-io/web-sdk';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace';

export const sdkControl = initSDK({
  appID: '11111',
  appVersion: '1.0.0',
  spanExporters: [new ConsoleSpanExporter()],
  logExporters: [new ConsoleLogRecordExporter()],
  logLevel: DiagLogLevel.ALL,
  embraceDataURL: 'http://localhost:3001',
  embraceConfigURL: 'http://localhost:3001',
  // Disabled until integration testing golden file generation is made more consistent across environments
  useDocumentTitleAsPageLabel: false,
  defaultInstrumentationConfig: {
    omit: new Set(['loaf']),
    'user-timing': { allowedEntries: [] },
  },
});

// Playwright drives the SDK through this global: page.evaluate runs in the page
// realm and cannot reach the bundle's module scope.
declare global {
  interface Window {
    EMBRACE_SDK: Exclude<ReturnType<typeof initSDK>, false>;
  }
}

// Falsy during SSR, when remote config samples this device out, or on init
// failure, so tests can assert on the global's absence.
if (sdkControl) {
  window.EMBRACE_SDK = sdkControl;
}

export default function EmbraceWebSdk() {
  return null;
}
