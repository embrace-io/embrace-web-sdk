const { sdk } = require('@embrace-io/web-sdk');
const { ZoneContextManager } = require('@opentelemetry/context-zone');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const {
  DocumentLoadInstrumentation,
} = require('@opentelemetry/instrumentation-document-load');
const { ConsoleLogRecordExporter } = require('@opentelemetry/sdk-logs');
const {
  ConsoleSpanExporter,
  WebTracerProvider,
} = require('@opentelemetry/sdk-trace-web');

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
