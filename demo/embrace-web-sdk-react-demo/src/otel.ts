import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-web';
import {sdk} from '@embraceio/embrace-web-sdk';
import {
  ConsoleLogRecordExporter,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';

const setupOTel = () => {
  sdk.initSDK({
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
    logProcessors: [
      new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
    ],
  });
};

export {setupOTel};
