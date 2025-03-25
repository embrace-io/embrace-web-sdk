import type { ContextManager, TextMapPropagator } from '@opentelemetry/api';
import { metrics, trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import {
  BatchLogRecordProcessor,
  LoggerProvider
} from '@opentelemetry/sdk-logs';
import type { MetricReader } from '@opentelemetry/sdk-metrics';
import {
  MeterProvider,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-web';
import {
  BatchSpanProcessor,
  WebTracerProvider
} from '@opentelemetry/sdk-trace-web';
import { createSessionSpanProcessor } from '@opentelemetry/web-common';
import type { SpanSessionManager } from '../api-sessions/index.js';
import { session } from '../api-sessions/index.js';
import type { UserManager } from '../api-users/index.js';
import { KEY_ENDUSER_PSEUDO_ID, user } from '../api-users/index.js';
import {
  EmbraceLogExporter,
  EmbraceTraceExporter
} from '../exporters/index.js';
import {
  ClicksInstrumentation,
  EmbraceSpanSessionManager,
  EmbraceUserManager,
  GlobalExceptionInstrumentation,
  LocalStorageUserInstrumentation,
  SpanSessionBrowserActivityInstrumentation,
  SpanSessionOnLoadInstrumentation,
  SpanSessionTimeoutInstrumentation,
  SpanSessionVisibilityInstrumentation,
  WebVitalsInstrumentation
} from '../instrumentations/index.js';
import {
  EmbraceNetworkSpanProcessor,
  EmbraceSessionBatchedSpanProcessor,
  EmbTypeLogRecordProcessor,
  IdentifiableSessionLogRecordProcessor
} from '../processors/index.js';
import { getWebSDKResource } from '../resources/index.js';
import { isValidAppID } from './utils.js';

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
  instrumentations?: Instrumentation[] | null;
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
  /**
   * metricReaders is an interface which allows hooks for metric emitting and exporting.
   * They are invoked in the same order as they were registered.
   * Readers created by the sdk are inserted after readers in this list.
   */
  metricReaders?: MetricReader[];
}

export const initSDK = ({
  appID,
  resource = Resource.default(),
  exporters = ['embrace'],
  spanProcessors = [],
  propagator = null,
  instrumentations = null,
  contextManager = null,
  logProcessors = [],
  metricReaders = []
}: SDKInitConfig = {}) => {
  try {
    const userManager = setupUser();
    // We initialize LocalStorageUserInstrumentation outside of the setupInstrumentation function to ensure that the
    // userManager is enabled and the LocalStorageUserInstrumentation provides a valid userID before the EmbraceHeaders
    // are added to the different exporters. Embrace headers depend on the userID (aka device ID) to be set.
    // TODO find a better way to avoid this condition by using delegates and adding the headers later on demand instead
    //  of during initialization. As of now, OTel packages only support adding headers during initialization, so we need
    //  to first add the ability to delegate the retrieval of headers to a callback to the base OTel implementation
    new LocalStorageUserInstrumentation();

    const resourceWithWebSDKAttributes = resource.merge(getWebSDKResource());

    const spanSessionManager = setupSession();

    const meterProvider = setupMetrics({
      resource: resourceWithWebSDKAttributes,
      exporters,
      readers: metricReaders
    });

    const loggerProvider = setupLogs({
      appID,
      userManager,
      resource: resourceWithWebSDKAttributes,
      exporters,
      logProcessors,
      spanSessionManager
    });

    setupTraces({
      appID,
      userManager,
      exporters,
      spanSessionManager,
      propagator,
      contextManager,
      spanProcessors,
      loggerProvider,
      resource: resourceWithWebSDKAttributes
    });
    // NOTE: we require setupInstrumentation to run the last, after setupLogs and setupTraces. This is how OTel works wrt the dependencies between instrumentations and global providers.
    // We need the providers for meters, tracers, and logs to be setup before we enable instrumentations.
    setupInstrumentation({
      instrumentations,
      spanSessionManager,
      meterProvider
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error.';
    console.error(`failed to initialize the SDK: ${message}`);
  }
};

interface SetupTracesArgs {
  appID?: string;
  resource: Resource;
  exporters: Exporter[];
  propagator?: TextMapPropagator | null;
  contextManager?: ContextManager | null;
  spanProcessors: SpanProcessor[];
  spanSessionManager: SpanSessionManager;
  loggerProvider: LoggerProvider;
  userManager: UserManager;
}

interface SetupMetricsArgs {
  resource: Resource;
  exporters: Exporter[];
  readers: MetricReader[];
}

const setupSession = () => {
  const embraceSpanSessionManager = new EmbraceSpanSessionManager();
  session.setGlobalSessionManager(embraceSpanSessionManager);
  return embraceSpanSessionManager;
};

const setupUser = () => {
  const embraceUserManager = new EmbraceUserManager();
  user.setGlobalUserManager(embraceUserManager);
  return embraceUserManager;
};

const METRICS_EXPORT_INTERVAL = 10000; // 10 seconds

const setupMetrics = ({ resource, exporters, readers }: SetupMetricsArgs) => {
  const finalReaders = [...readers];
  if (exporters.includes('otlp')) {
    const otlpExporter = new OTLPMetricExporter();
    const metricOTLPReader = new PeriodicExportingMetricReader({
      exporter: otlpExporter,
      exportIntervalMillis: METRICS_EXPORT_INTERVAL // Export metrics every 10 seconds.
    });
    finalReaders.push(metricOTLPReader);
  }
  // Initialize a MeterProvider with the above configurations.
  const myServiceMeterProvider = new MeterProvider({
    resource,
    readers: finalReaders
  });
  // Set the initialized MeterProvider as global to enable metric collection across the app.
  metrics.setGlobalMeterProvider(myServiceMeterProvider);
  return myServiceMeterProvider;
};

const setupTraces = ({
  appID,
  userManager,
  resource,
  exporters,
  spanProcessors = [],
  propagator = null,
  contextManager = null,
  spanSessionManager
}: SetupTracesArgs) => {
  const finalSpanProcessors: SpanProcessor[] = [
    ...spanProcessors,
    createSessionSpanProcessor(spanSessionManager)
  ];

  if (exporters.includes('otlp')) {
    const otlpExporter = new OTLPTraceExporter();
    const otlpProcessor = new BatchSpanProcessor(otlpExporter);

    finalSpanProcessors.push(otlpProcessor);
  }

  if (exporters.includes('embrace')) {
    if (isValidAppID(appID)) {
      const enduserPseudoID = userManager.getUser()?.[KEY_ENDUSER_PSEUDO_ID];
      if (!enduserPseudoID) {
        throw new Error('userID is required when using Embrace exporter');
      }
      const embraceTraceExporter = new EmbraceTraceExporter({
        appID,
        userID: enduserPseudoID
      });
      const embraceSessionBatchedProcessor =
        new EmbraceSessionBatchedSpanProcessor({
          exporter: embraceTraceExporter
        });
      const embraceNetworkSpanProcessor = new EmbraceNetworkSpanProcessor();

      finalSpanProcessors.push(embraceNetworkSpanProcessor);
      finalSpanProcessors.push(embraceSessionBatchedProcessor);
    }
  }
  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: finalSpanProcessors
  });

  tracerProvider.register({
    ...(!!contextManager && { contextManager }),
    propagator
  });
  trace.setGlobalTracerProvider(tracerProvider);

  return tracerProvider;
};

interface SetupLogsArgs {
  appID?: string;
  resource: Resource;
  exporters: Exporter[];
  logProcessors: LogRecordProcessor[];
  spanSessionManager: SpanSessionManager;
  userManager: UserManager;
}

const setupLogs = ({
  appID,
  userManager,
  resource,
  exporters,
  logProcessors,
  spanSessionManager
}: SetupLogsArgs) => {
  const loggerProvider = new LoggerProvider({
    resource
  });

  const finalLogProcessors: LogRecordProcessor[] = [
    ...logProcessors,
    new IdentifiableSessionLogRecordProcessor({
      spanSessionManager
    }),
    new EmbTypeLogRecordProcessor()
  ];

  if (exporters.includes('otlp')) {
    const otlpLogsExporter = new OTLPLogExporter();

    finalLogProcessors.push(new BatchLogRecordProcessor(otlpLogsExporter));
  }

  if (exporters.includes('embrace')) {
    if (isValidAppID(appID)) {
      const enduserPseudoID = userManager.getUser()?.[KEY_ENDUSER_PSEUDO_ID];
      if (!enduserPseudoID) {
        throw new Error('userID is required when using Embrace exporter');
      }
      const embraceLogsExporter = new EmbraceLogExporter({
        appID,
        userID: enduserPseudoID
      });
      finalLogProcessors.push(new BatchLogRecordProcessor(embraceLogsExporter));
    }
  }

  for (const logProcessor of finalLogProcessors) {
    loggerProvider.addLogRecordProcessor(logProcessor);
  }

  logs.setGlobalLoggerProvider(loggerProvider);

  return loggerProvider;
};

interface SetupInstrumentationArgs {
  instrumentations: Instrumentation[] | null;
  spanSessionManager: SpanSessionManager;
  meterProvider: MeterProvider;
}

const setupWebAutoInstrumentations = () =>
  getWebAutoInstrumentations({
    // Covered by our ClicksInstrumentation
    '@opentelemetry/instrumentation-user-interaction': {
      enabled: false
    }
  });

const setupInstrumentation = ({
  instrumentations = null,
  spanSessionManager,
  meterProvider
}: SetupInstrumentationArgs) => {
  // TODO: do we need to expose an api to allow external disabling of instrumentations? `registerInstrumentations`
  // returns a callback to disable instrumentations, but we are ignoring it atm
  registerInstrumentations({
    instrumentations: [
      new SpanSessionOnLoadInstrumentation(),
      instrumentations ?? setupWebAutoInstrumentations(),
      new WebVitalsInstrumentation({
        spanSessionManager,
        meterProvider
      }),
      new GlobalExceptionInstrumentation(),
      new SpanSessionVisibilityInstrumentation(),
      new ClicksInstrumentation(),
      new SpanSessionBrowserActivityInstrumentation(),
      new SpanSessionTimeoutInstrumentation()
    ]
  });
};
