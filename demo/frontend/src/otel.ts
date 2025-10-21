import { DiagLogLevel, initSDK, user } from '@embrace-io/web-sdk';
import { createReactRouterNavigationInstrumentation } from '@embrace-io/web-sdk/react-instrumentation';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';

const SAMPLE_APP_ID = import.meta.env.VITE_APP_ID;
const DATA_URL = import.meta.env.VITE_DATA_URL;
const CONFIG_URL = import.meta.env.VITE_CONFIG_URL;

const setupOTel = () => {
  const result = initSDK({
    logLevel: DiagLogLevel.ALL,
    appID: SAMPLE_APP_ID,
    appVersion: '1.0.0',
    spanExporters: [new ConsoleSpanExporter()],
    logExporters: [new ConsoleLogRecordExporter()],
    defaultInstrumentationConfig: {
      'session-visibility': {
        limitedSessionMaxDurationMs: 3000,
      },
    },
    instrumentations: [createReactRouterNavigationInstrumentation()],
    embraceDataURL: DATA_URL ?? undefined,
    embraceConfigURL: CONFIG_URL ?? undefined,
  });

  if (result) {
    console.log('Successfully initialized the Embrace SDK', SAMPLE_APP_ID);
  } else {
    console.log('Failed to initialize the Embrace SDK', SAMPLE_APP_ID);
  }

  user.setUserId('test-user-id');
};

export { setupOTel };
