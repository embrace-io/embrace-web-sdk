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
  GlobalExceptionInstrumentation,
  EmbraceSpanEventExceptionToLogProcessor,
} from '@embraceio/embrace-web-sdk';
import {
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {createSessionSpanProcessor} from '@opentelemetry/web-common';
import {registerInstrumentations} from '@opentelemetry/instrumentation';
import {ZoneContextManager} from '@opentelemetry/context-zone';
import {B3Propagator} from '@opentelemetry/propagator-b3';
import {getWebAutoInstrumentations} from '@opentelemetry/auto-instrumentations-web';

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
  const embraceSpanEventExceptionToLogProcessor =
    new EmbraceSpanEventExceptionToLogProcessor(
      loggerProvider.getLogger('exceptions'),
    );

  const tracerProvider = new WebTracerProvider({
    resource: resource,
    spanProcessors: [
      sessionProcessor,
      consoleSpanProcessor,
      embraceSessionBatchedProcessor,
      embraceSpanEventExceptionToLogProcessor,
    ],
  });

  tracerProvider.register({
    // todo why do we need these? do the auto instrumentation libraries depend on them? copied from otel docs
    contextManager: new ZoneContextManager(),
    propagator: new B3Propagator(),
  });
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

  registerInstrumentations({
    instrumentations: [getWebAutoInstrumentations(), new GlobalExceptionInstrumentation()],
  });
};

export {setupOTelSDK, loggerProvider, sessionProvider};
