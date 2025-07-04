'use client';

import { sdk } from '@embrace-io/web-sdk';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';

let sdkControl: ReturnType<typeof sdk.initSDK> | null = null;

if (typeof window !== 'undefined') {
  console.log('sdk initialized');
  sdkControl = sdk.initSDK({
    appID: '11111',
    spanExporters: [new ConsoleSpanExporter()],
    logExporters: [new ConsoleLogRecordExporter()],
    logLevel: sdk.DiagLogLevel.ALL,
  });
}

export default sdkControl;
