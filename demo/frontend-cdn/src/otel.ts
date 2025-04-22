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
  // @ts-ignore
  window.EmbraceWebSdk.sdk.initSDK({
    appID: SAMPLE_APP_ID,
    appVersion: '0.0.1',
    spanSampler: new TraceIdRatioBasedSampler(SAMPLE_PERCENTAGE),
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
    logProcessors: [
      new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
    ],
  });
};

export { setupOTel };
