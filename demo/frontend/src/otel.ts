import { sdk } from '@embrace-io/web-sdk';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';
import { createReactRouterV6DeclarativeNavigationInstrumentation } from '@embrace-io/web-sdk/react-instrumentation';

const SAMPLE_APP_ID = import.meta.env.VITE_APP_ID;

const setupOTel = () => {
  const result = sdk.initSDK({
    appID: SAMPLE_APP_ID,
    spanExporters: [new ConsoleSpanExporter()],
    logExporters: [new ConsoleLogRecordExporter()],
    instrumentations: [
      createReactRouterV6DeclarativeNavigationInstrumentation(),
    ],
  });

  if (!!result) {
    console.log('Successfully initialized the Embrace SDK');
  } else {
    console.log('Failed to initialize the Embrace SDK');
  }
};

export { setupOTel };
