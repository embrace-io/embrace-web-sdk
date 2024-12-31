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
  EmbraceSessionBatchedProcessor,
  EmbraceTraceExporter,
  EmbraceLogExporter,
  IdentifiableSessionLogRecordProcessor,
  SpanSessionProvider,
} from '@embraceio/embrace-web-sdk';
import {
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {createSessionSpanProcessor} from '@opentelemetry/web-common';

const loggerProvider = new LoggerProvider({
  resource: Resource.default().merge(getWebSDKResource()),
});

const sessionProvider = new SpanSessionProvider();

const setupOTelSDK = () => {
  const resource = Resource.default().merge(getWebSDKResource());

  const consoleExporter = new ConsoleSpanExporter();
  const embraceTraceExporter = new EmbraceTraceExporter();

  const sessionProcessor = createSessionSpanProcessor(sessionProvider);
  const embraceSessionBatchedProcessor = new EmbraceSessionBatchedProcessor(
    embraceTraceExporter,
  );
  const consoleSpanProcessor = new SimpleSpanProcessor(consoleExporter);

  const tracerProvider = new WebTracerProvider({
    resource: resource,
    spanProcessors: [
      sessionProcessor,
      consoleSpanProcessor,
      embraceSessionBatchedProcessor,
    ],
  });

  tracerProvider.register();
  trace.setGlobalTracerProvider(tracerProvider);

  const logExporter = new EmbraceLogExporter();

  loggerProvider.addLogRecordProcessor(
    new IdentifiableSessionLogRecordProcessor(sessionProvider),
  );
  loggerProvider.addLogRecordProcessor(
    new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
  );
  loggerProvider.addLogRecordProcessor(
    new SimpleLogRecordProcessor(logExporter),
  );

  logs.setGlobalLoggerProvider(loggerProvider);

  // Start the session span after the SDK is initialized
  sessionProvider.startSessionSpan();
};

export {setupOTelSDK, loggerProvider, sessionProvider};
