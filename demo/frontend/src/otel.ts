import { sdk } from '@embrace-io/web-sdk';
import {
  ConsoleLogRecordExporter,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-web';

const SAMPLE_APP_ID = import.meta.env.VITE_APP_ID;

const setupOTel = () => {
  sdk.initSDK({
    appID: SAMPLE_APP_ID,
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
    logProcessors: [
      new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
    ],
  });
};

export { setupOTel };
