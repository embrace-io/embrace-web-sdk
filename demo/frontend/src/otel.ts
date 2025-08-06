import { ReplayInstrumentation, sdk, user } from '@embrace-io/web-sdk';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';
import { createReactRouterNavigationInstrumentation } from '@embrace-io/web-sdk/react-instrumentation';

const SAMPLE_APP_ID = import.meta.env.VITE_APP_ID;

const setupOTel = () => {
  const result = sdk.initSDK({
    appID: SAMPLE_APP_ID,
    appVersion: '1.0.0',
    spanExporters: [new ConsoleSpanExporter()],
    logExporters: [new ConsoleLogRecordExporter()],
    instrumentations: [
      createReactRouterNavigationInstrumentation(),
      new ReplayInstrumentation({
        // turn off compression for easier debugging
        compress: false,
      }),
    ],
    logLevel: sdk.DiagLogLevel.DEBUG, // Enable debug logs to see replay events
  });

  if (result) {
    console.log('Successfully initialized the Embrace SDK', SAMPLE_APP_ID);
  } else {
    console.log('Failed to initialize the Embrace SDK', SAMPLE_APP_ID);
  }

  user.setUserId('test-user-id');
};

export { setupOTel };
