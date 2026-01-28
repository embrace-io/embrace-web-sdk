import { DiagLogLevel, initSDK, session } from '@embrace-io/web-sdk';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';

declare global {
  interface Window {
    EMBRACE_CURRENT_SESSION_ID?: string | null;
  }
}

export const sdkControl = initSDK({
  appID: '11111',
  appVersion: '1.0.0',
  spanExporters: [new ConsoleSpanExporter()],
  logExporters: [new ConsoleLogRecordExporter()],
  logLevel: DiagLogLevel.ALL,
  embraceDataURL: 'http://localhost:3001',
  embraceConfigURL: 'http://localhost:3001',
});

if (typeof window !== 'undefined') {
  window.EMBRACE_CURRENT_SESSION_ID = session.getSessionId();
}
