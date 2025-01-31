import {Resource} from '@opentelemetry/resources';
import {getWebSDKResource} from '../resources';
import {
  EmbraceSpanSessionProvider,
  GlobalExceptionInstrumentation,
  SpanSessionInstrumentation,
} from '../instrumentations';
import {createSessionSpanProcessor} from '@opentelemetry/web-common';
import {
  BatchSpanProcessor,
  SpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import {B3Propagator} from '@opentelemetry/propagator-b3';
import {ContextManager, TextMapPropagator, trace} from '@opentelemetry/api';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
  LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  EmbraceNetworkSpanProcessor,
  EmbraceSessionBatchedProcessor,
  EmbraceSpanEventExceptionToLogProcessor,
  IdentifiableSessionLogRecordProcessor,
} from '../processors';
import {logs} from '@opentelemetry/api-logs';
import {registerInstrumentations} from '@opentelemetry/instrumentation';
import {getWebAutoInstrumentations} from '@opentelemetry/auto-instrumentations-web';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {EmbraceLogExporter, EmbraceTraceExporter} from '../exporters';
import {OTLPLogExporter} from '@opentelemetry/exporter-logs-otlp-http';
import {session} from '../api-sessions';
import {CompositePropagator} from '@opentelemetry/core';
import {Instrumentation} from '@opentelemetry/instrumentation/build/src/types';

type Exporter = 'otlp' | 'embrace';

interface SDKInitConfig {
  /**
   * appID is a unique identifier for your application. It is used to identify your application in Embrace, and it is only required when
   * the Embrace exporter is enabled. You can find your appID in the Embrace dashboard. If embrace exporter is disabled this value will be ignored.
   *
   * **default**: undefined
   */
  appID?: string;
  resource?: Resource;
  /**
   * Exporters process and export your telemetry data.
   *
   * Exporters supported by this list are automatically configured:
   *   * 'otlp' - Standard OpenTelemetry Protocol exporter. Uses HTTP to send data to the configured collector.
   *              It uses BatchSpanProcessor as processor.
   *              If you need further customization you can set up your OTLP collector and processor through `spanProcessors` and `logProcessors`
   *   * 'embrace' - Embrace exporter. Sends data to the Embrace backend using OTLP though HTTP.
   *                 It applies the necessary transformations to the data to be compatible with Embrace.
   *
   * **default**: ['embrace']
   *
   * You can set up other exporters by proving the necessary processors.
   */
  exporters?: Exporter[];
  propagator?: TextMapPropagator | null;
  contextManager?: ContextManager | null;
  instrumentations?: Instrumentation[];
  /**
   * Span processor is an interface which allows hooks for span start and end method invocations.
   * They are invoked in the same order as they were registered.
   * Processors created by the sdk are inserted after processors in this list.
   */
  spanProcessors?: SpanProcessor[];
  /**
   * LogRecordProcessor is an interface which allows hooks for LogRecord emitting.
   * They are invoked in the same order as they were registered.
   * Processors created by the sdk are inserted after processors in this list.
   */
  logProcessors?: LogRecordProcessor[];
}

const initSDK = ({
  appID,
  resource = Resource.default(),
  exporters = ['embrace'],
  spanProcessors = [],
  propagator = null,
  instrumentations = [],
  contextManager = null,
  logProcessors = [],
}: SDKInitConfig = {}) => {
  const resourceWithWebSDKAttributes = resource.merge(getWebSDKResource());

  const sessionProvider = setupSession();

  const loggerProvider = setupLogs({
    appID,
    resource: resourceWithWebSDKAttributes,
    exporters,
    logProcessors,
    sessionProvider,
  });

  setupTraces({
    appID,
    exporters,
    sessionProvider,
    propagator,
    contextManager,
    spanProcessors,
    loggerProvider,
    resource: resourceWithWebSDKAttributes,
  });

  setupInstrumentation(instrumentations);
};

interface SetupTracesArgs {
  appID?: string;
  resource: Resource;
  exporters: Exporter[];
  propagator?: TextMapPropagator | null;
  contextManager?: ContextManager | null;
  spanProcessors: SpanProcessor[];
  sessionProvider: EmbraceSpanSessionProvider;
  loggerProvider: LoggerProvider;
}

const setupSession = () => {
  const embraceSpanSessionProvider = new EmbraceSpanSessionProvider();

  session.setGlobalSessionProvider(embraceSpanSessionProvider);

  return embraceSpanSessionProvider;
};

const setupTraces = ({
  appID,
  resource,
  exporters,
  spanProcessors = [],
  propagator = null,
  contextManager = null,
  sessionProvider,
  loggerProvider,
}: SetupTracesArgs) => {
  const finalSpanProcessors: SpanProcessor[] = [
    ...spanProcessors,
    createSessionSpanProcessor(sessionProvider),
  ];

  if (exporters.includes('otlp')) {
    const otlpExporter = new OTLPTraceExporter();
    const otlpProcessor = new BatchSpanProcessor(otlpExporter);

    finalSpanProcessors.push(otlpProcessor);
  }

  if (exporters.includes('embrace')) {
    if (appID === undefined) {
      throw new Error('appID is required when using Embrace exporter');
    }
    const embraceTraceExporter = new EmbraceTraceExporter(appID);
    const embraceSessionBatchedProcessor = new EmbraceSessionBatchedProcessor(
      embraceTraceExporter,
    );
    const embraceSpanEventExceptionToLogProcessor =
      new EmbraceSpanEventExceptionToLogProcessor(
        loggerProvider.getLogger('exceptions'),
      );
    const embraceNetworkSpanProcessor = new EmbraceNetworkSpanProcessor();

    finalSpanProcessors.push(embraceNetworkSpanProcessor);
    finalSpanProcessors.push(embraceSessionBatchedProcessor);
    finalSpanProcessors.push(embraceSpanEventExceptionToLogProcessor);
  }

  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: finalSpanProcessors,
  });

  tracerProvider.register({
    ...(!!contextManager && {contextManager: contextManager}),
    // todo why do we need B3Propagator? do the auto instrumentation libraries depend on them? copied from otel docs
    propagator: propagator
      ? new CompositePropagator({
          propagators: [propagator, new B3Propagator()],
        })
      : new B3Propagator(),
  });
  trace.setGlobalTracerProvider(tracerProvider);

  return tracerProvider;
};

interface SetupLogsArgs {
  appID?: string;
  resource: Resource;
  exporters: Exporter[];
  logProcessors: LogRecordProcessor[];
  sessionProvider: EmbraceSpanSessionProvider;
}

const setupLogs = ({
  appID,
  resource,
  exporters,
  logProcessors,
  sessionProvider,
}: SetupLogsArgs) => {
  const loggerProvider = new LoggerProvider({
    resource,
  });

  const finalLogProcessors: LogRecordProcessor[] = [
    ...logProcessors,
    new IdentifiableSessionLogRecordProcessor(sessionProvider),
  ];

  if (exporters.includes('otlp')) {
    const otlpLogsExporter = new OTLPLogExporter();

    finalLogProcessors.push(new BatchLogRecordProcessor(otlpLogsExporter));
  }

  if (exporters.includes('embrace')) {
    if (appID === undefined) {
      throw new Error('appID is required when using Embrace exporter');
    }
    const embraceLogsExporter = new EmbraceLogExporter(appID);

    finalLogProcessors.push(new BatchLogRecordProcessor(embraceLogsExporter));
  }

  for (const logProcessor of finalLogProcessors) {
    loggerProvider.addLogRecordProcessor(logProcessor);
  }

  logs.setGlobalLoggerProvider(loggerProvider);

  return loggerProvider;
};

const setupInstrumentation = (instrumentations: Instrumentation[] = []) => {
  registerInstrumentations({
    instrumentations: [
      instrumentations.length ? instrumentations : getWebAutoInstrumentations(),
      new GlobalExceptionInstrumentation(),
      new SpanSessionInstrumentation(),
    ],
  });
};

export {initSDK};
