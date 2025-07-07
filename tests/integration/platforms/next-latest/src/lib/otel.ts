'use client';

import { sdk, session } from '@embrace-io/web-sdk';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';

let sdkControl: ReturnType<typeof sdk.initSDK> | null = null;

declare global {
  interface Window {
    EMBRACE_CURRENT_SESSION_ID: string | null;
  }
}

if (typeof window !== 'undefined') {
  console.log('sdk initialized');
  sdkControl = sdk.initSDK({
    appID: '11111',
    spanExporters: [new ConsoleSpanExporter()],
    logExporters: [new ConsoleLogRecordExporter()],
    logLevel: sdk.DiagLogLevel.ALL,
  });

  window.EMBRACE_CURRENT_SESSION_ID = session.getSessionId();
}

export default sdkControl;
