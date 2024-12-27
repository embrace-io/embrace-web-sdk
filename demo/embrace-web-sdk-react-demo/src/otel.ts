import {Resource} from '@opentelemetry/resources';
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import {trace} from '@opentelemetry/api';
import {logs} from '@opentelemetry/api-logs';
import {
  getWebSDKResource,
  SessionSpanProcessor,
  EmbraceTraceExporter,
  EmbraceLogExporter,
} from '@embraceio/embrace-web-sdk';
import {
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';

const loggerProvider = new LoggerProvider({
  resource: Resource.default().merge(getWebSDKResource()),
});

const setupOTelSDK = () => {
  const resource = Resource.default().merge(getWebSDKResource());

  const consoleExporter = new ConsoleSpanExporter();
  const embraceTraceExporter = new EmbraceTraceExporter();

  const sessionSpanProcessor = new SessionSpanProcessor(embraceTraceExporter);
  const consoleSpanProcessor = new SimpleSpanProcessor(consoleExporter);

  const tracerProvider = new WebTracerProvider({
    resource: resource,
    spanProcessors: [sessionSpanProcessor, consoleSpanProcessor],
  });

  tracerProvider.register();
  trace.setGlobalTracerProvider(tracerProvider);

  const logExporter = new EmbraceLogExporter();

  loggerProvider.addLogRecordProcessor(
    new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
  );
  loggerProvider.addLogRecordProcessor(
    new SimpleLogRecordProcessor(logExporter),
  );

  logs.setGlobalLoggerProvider(loggerProvider);
};

export {setupOTelSDK, loggerProvider};
