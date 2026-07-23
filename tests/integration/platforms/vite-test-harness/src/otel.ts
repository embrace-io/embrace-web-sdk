import { DiagLogLevel, initSDK, session } from '@embrace-io/web-sdk';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace';

const sdkControl = initSDK({
  appID: '11111',
  appVersion: '1.0.0',
  spanExporters: [new ConsoleSpanExporter()],
  logExporters: [new ConsoleLogRecordExporter()],
  logLevel: DiagLogLevel.ALL,
  embraceDataURL: 'http://localhost:3001',
  embraceConfigURL: 'http://localhost:3001',
  useDocumentTitleAsPageLabel: true,
  defaultInstrumentationConfig: {
    'user-timing': { allowedEntries: [] },
  },
});

declare global {
  interface Window {
    EMBRACE_CURRENT_USER_SESSION_ID: string | null;
  }
}

window.EMBRACE_CURRENT_USER_SESSION_ID = session.getUserSessionId();

export { sdkControl };
