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
  defaultInstrumentationConfig: {
    omit: new Set(['loaf']),
    'user-timing': { allowedEntries: [] },
  },
});

declare global {
  interface Window {
    EMBRACE_CURRENT_USER_SESSION_ID: string | null;
    EMBRACE_CURRENT_SESSION_PART_ID: string | null;
  }
}

if (typeof window !== 'undefined') {
  window.EMBRACE_CURRENT_USER_SESSION_ID = session.getUserSessionId();
  window.EMBRACE_CURRENT_SESSION_PART_ID =
    session.getSessionPartSpan()?.spanContext().spanId ?? null;
}
