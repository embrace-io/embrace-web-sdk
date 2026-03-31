/// <reference types="vite/client" />
import { DiagLogLevel, initSDK, user } from '@embrace-io/web-sdk';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';

const APP_ID = import.meta.env.VITE_APP_ID;
const DATA_URL = import.meta.env.VITE_DATA_URL;
const CONFIG_URL = import.meta.env.VITE_CONFIG_URL;

const setupSDK = (instrumentations?: Instrumentation[]) => {
  const result = initSDK({
    logLevel: DiagLogLevel.ALL,
    appID: APP_ID || undefined,
    appVersion: '1.0.0',
    spanExporters: [new ConsoleSpanExporter()],
    logExporters: [new ConsoleLogRecordExporter()],
    defaultInstrumentationConfig: {
      'session-visibility': {
        limitedSessionMaxDurationMs: 3000,
      },
      'empty-root': {
        rootNode: document.getElementById('root'),
      },
    },
    ...(instrumentations ? { instrumentations } : {}),
    embraceDataURL: DATA_URL ?? undefined,
    embraceConfigURL: CONFIG_URL ?? undefined,
  });

  if (result) {
    console.log('Successfully initialized the Embrace SDK', APP_ID);
  } else {
    console.error('Failed to initialize the Embrace SDK', APP_ID);
  }

  user.setUserId('test-user-id');
};

export { setupSDK };
