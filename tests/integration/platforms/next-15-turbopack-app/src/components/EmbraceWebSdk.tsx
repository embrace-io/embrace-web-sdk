'use client';

import { DiagLogLevel, initSDK, session } from '@embrace-io/web-sdk';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';

export const embraceWebSdk = initSDK({
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

declare global {
  interface Window {
    EMBRACE_CURRENT_USER_SESSION_ID: string | null;
  }
}

if (typeof window !== 'undefined') {
  window.EMBRACE_CURRENT_USER_SESSION_ID = session.getUserSessionId();
}

export default function EmbraceWebSdk() {
  return null;
}
