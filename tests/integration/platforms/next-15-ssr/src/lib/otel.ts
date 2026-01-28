/**
 * Shared OpenTelemetry setup - safe to import from both SSR and client code.
 * Telemetry is only captured client-side where browser APIs are available.
 */
import { DiagLogLevel, initSDK, session } from '@embrace-io/web-sdk';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';

declare global {
  interface Window {
    EMBRACE_CURRENT_SESSION_ID?: string | null;
  }
}

// Initialize SDK - returns false in SSR (no browser APIs), SDKControl on success
export const sdkControl = initSDK({
  appID: '11111',
  appVersion: '1.0.0',
  logLevel: DiagLogLevel.ALL,
  spanExporters: [new ConsoleSpanExporter()],
  logExporters: [new ConsoleLogRecordExporter()],
  embraceDataURL: 'http://localhost:3001',
  embraceConfigURL: 'http://localhost:3001',
});

// Only access session API when SDK initialized successfully (client-side)
if (typeof window !== 'undefined') {
  window.EMBRACE_CURRENT_SESSION_ID = session.getSessionId();
}
