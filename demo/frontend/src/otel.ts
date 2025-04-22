import { sdk } from '@embrace-io/web-sdk';
import {
  ConsoleLogRecordExporter,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-web';

const SAMPLE_APP_ID = import.meta.env.VITE_APP_ID;
const DEFAULT_SAMPLE_PERCENTAGE = 1; // 100% sampling; Value between 0 and 1
const SAMPLE_PERCENTAGE =
  Number(import.meta.env.VITE_SAMPLE_PERCENTAGE) || DEFAULT_SAMPLE_PERCENTAGE;
const setupOTel = () => {
  const result = sdk.initSDK({
    appID: SAMPLE_APP_ID,
    spanSampler: new TraceIdRatioBasedSampler(SAMPLE_PERCENTAGE),
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
    logProcessors: [
      new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
    ],
  });

  if (!!result) {
    console.log('Successfully initialized the Embrace SDK');
  } else {
    console.log('Failed to initialize the Embrace SDK');
  }
};

export { setupOTel };
