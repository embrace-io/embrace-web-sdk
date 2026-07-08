/// <reference types="vite/client" />
import { DiagLogLevel, initSDK, user } from '@embrace-io/web-sdk';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import type { LogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import type { SpanExporter } from '@opentelemetry/sdk-trace-web';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';
import { version } from '../../../packages/web-sdk/package.json' with {
  type: 'json',
};

const APP_ID = import.meta.env.VITE_APP_ID;
const DATA_URL = import.meta.env.VITE_DATA_URL;
const CONFIG_URL = import.meta.env.VITE_CONFIG_URL;

const setupSDK = (
  instrumentations?: Instrumentation[],
  extraSpanExporters: SpanExporter[] = [],
  extraLogExporters: LogRecordExporter[] = [],
) => {
  const result = initSDK({
    logLevel: DiagLogLevel.ALL,
    appID: APP_ID || undefined,
    appVersion: version,
    spanExporters: [new ConsoleSpanExporter(), ...extraSpanExporters],
    logExporters: [new ConsoleLogRecordExporter(), ...extraLogExporters],
    defaultInstrumentationConfig: {
      'empty-root': {
        rootNode: document.getElementById('root'),
      },
      // To exclude specific instrumentations use the `omit` field:
      // omit: new Set([
      //   '@opentelemetry/instrumentation-fetch',
      //   '@opentelemetry/instrumentation-xml-http-request',
      //   'document-load',
      // ]),
    },
    ...(instrumentations ? { instrumentations } : {}),
    embraceDataURL: DATA_URL ?? undefined,
    embraceConfigURL: CONFIG_URL ?? undefined,
  });

  if (result) {
    console.log('Successfully initialized the Embrace SDK', APP_ID, version);
  } else {
    console.error('Failed to initialize the Embrace SDK', APP_ID);
  }

  user.setUserId('test-user-id');
};

export { setupSDK };
