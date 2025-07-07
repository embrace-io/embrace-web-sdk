import { sdk, session } from '@embrace-io/web-sdk';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const sdkControl = sdk.initSDK({
  appID: '11111',
  spanExporters: [new ConsoleSpanExporter()],
  logExporters: [new ConsoleLogRecordExporter()],
  logLevel: sdk.DiagLogLevel.ALL,
});

declare global {
  interface Window {
    EMBRACE_CURRENT_SESSION_ID: string | null;
  }
}

window.EMBRACE_CURRENT_SESSION_ID = session.getSessionId();

export { sdkControl };
