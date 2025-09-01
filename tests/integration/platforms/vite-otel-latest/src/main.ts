import { sdk } from '@embrace-io/web-sdk';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs';
import {
  ConsoleSpanExporter,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';

const provider = new WebTracerProvider();

provider.register({
  contextManager: new ZoneContextManager(),
});

registerInstrumentations({
  instrumentations: [new DocumentLoadInstrumentation()],
});

sdk.initSDK({
  appID: '',
  appVersion: 'YOUR_APP_VERSION',
  logLevel: sdk.DiagLogLevel.INFO,
  spanExporters: [new ConsoleSpanExporter()],
  logExporters: [new ConsoleLogRecordExporter()],
});

const span = provider.getTracer('otel-collision').startSpan('main');
span.end();
