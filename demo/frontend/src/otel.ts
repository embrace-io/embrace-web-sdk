import { sdk } from '@embrace-io/web-sdk';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';
import { createReactRouterBrowserHistoryInstrumentation } from '@embrace-io/web-sdk/react-instrumentation';
import { History } from 'history';

const SAMPLE_APP_ID = import.meta.env.VITE_APP_ID;

type SetupOTelArgs = {
  history: History;
};

const setupOTel = ({ history }: SetupOTelArgs) => {
  const result = sdk.initSDK({
    appID: SAMPLE_APP_ID,
    spanExporters: [new ConsoleSpanExporter()],
    logExporters: [new ConsoleLogRecordExporter()],
    instrumentations: [
      createReactRouterBrowserHistoryInstrumentation({
        history,
        config: {},
      }),
    ],
  });

  if (!!result) {
    console.log('Successfully initialized the Embrace SDK');
  } else {
    console.log('Failed to initialize the Embrace SDK');
  }
};

export { setupOTel };
