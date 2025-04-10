import type {
  ContextManager,
  TextMapPropagator,
  DiagLogger,
} from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import type {
  LogRecordExporter,
  LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from '@opentelemetry/sdk-logs';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-web';
import {
  BatchSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import type { SpanSessionManager } from '../api-sessions/index.js';
import { session } from '../api-sessions/index.js';
import { KEY_ENDUSER_PSEUDO_ID, user } from '../api-users/index.js';
import {
  EmbraceLogExporter,
  EmbraceTraceExporter,
} from '../exporters/index.js';
import {
  EmbraceLogManager,
  EmbraceSpanSessionManager,
  EmbraceUserManager,
} from '../managers/index.js';
import {
  EmbraceNetworkSpanProcessor,
  EmbraceSessionBatchedSpanProcessor,
  EmbTypeLogRecordProcessor,
  IdentifiableSessionLogRecordProcessor,
} from '../processors/index.js';
import { getWebSDKResource } from '../resources/index.js';
import { isValidAppID } from './utils.js';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import {
  setupDefaultInstrumentations,
  type DefaultInstrumenationConfig,
} from './setupDefaultInstrumentations.js';
import { createSessionSpanProcessor } from '@opentelemetry/web-common';
import { log } from '../api-logs/index.js';

interface SDKInitConfig {
  /**
   * appID is a unique identifier for your application. It is used to identify your application in Embrace, and can be
   * found in the Embrace dashboard. This can only be omitted if at least one spanExporter or logExporter is setup to
   * send data to a collector other than Embrace.
   *
   * **default**: undefined
   */
  appID?: string;

  /**
   * appVersion is used to distinguish between different releases of your application. It can be set here if the value
   * is known in code, otherwise our CLI tool can be used to inject the value at build time.
   *
   * **default**: undefined
   */
  appVersion?: string;

  /**
   * defaultInstrumentationConfig can be used pass options to the default instrumentations by Embrace or turn certain
   * ones off entirely. Note that only some default instrumentations support configuration in this manner.
   *
   * **default**: undefined
   */
  defaultInstrumentationConfig?: DefaultInstrumenationConfig;

  /**
   * instrumentations can be set to include instrumentations beyond the default ones provided by Embrace. This does not
   * override Embrace's default instrumentations, to control those set `defaultInstrumentationConfig` instead.
   *
   * **default**: []
   */
  instrumentations?: Instrumentation[];

  /**
   * spanExporters can be set to export span to a collector other than Embrace. If `appID` is omitted at lease one
   * exporter needs to be set here, or in `logExporters`.
   *
   * **default**: []
   */
  spanExporters?: SpanExporter[];

  /**
   * logExporters can be set to export logs to a collector other than Embrace. If `appID` is omitted at lease one
   * exporter needs to be set here, or in `spanExporters`.
   *
   * **default**: []
   */
  logExporters?: LogRecordExporter[];

  /**
   * propagator defines a custom context propagator that will be attached to the TracerProvider setup by the SDK
   *
   * **default**: null
   */
  propagator?: TextMapPropagator | null;

  /**
   * contextManager defines a custom context manager that will be attached to the TracerProvider setup by the SDK
   *
   * **default**: null
   */
  contextManager?: ContextManager | null;

  /**
   * resource defines a custom Resource that will be merged with the resource defined in `src/resources/webSdkResource.ts`
   * and included with all produced telemetry
   *
   * **default**: Resource.default()
   */
  resource?: Resource;

  /**
   * spanProcessors
   * Span processor is an interface which allows hooks for span start and end method invocations.
   * They are invoked in the same order as they were registered.
   * Processors created by the sdk are inserted after processors in this list.
   *
   * **default**: []
   */
  spanProcessors?: SpanProcessor[];

  /**
   * logProcessors
   * LogRecordProcessor is an interface which allows hooks for LogRecord emitting.
   * They are invoked in the same order as they were registered.
   * Processors created by the sdk are inserted after processors in this list.
   *
   * **default**: []
   */
  logProcessors?: LogRecordProcessor[];

  diagLogger?: DiagLogger;
}

interface SDKControl {
  flush: () => Promise<void>;
}

export const initSDK = ({
  appID,
  appVersion,
  resource = Resource.default(),
  spanExporters = [],
  logExporters = [],
  spanProcessors = [],
  propagator = null,
  defaultInstrumentationConfig,
  instrumentations = [],
  contextManager = null,
  logProcessors = [],
  diagLogger = diag.createComponentLogger({
    namespace: 'embrace-sdk',
  }),
}: SDKInitConfig = {}): SDKControl | false => {
  try {
    const resourceWithWebSDKAttributes = resource.merge(
      getWebSDKResource(appVersion)
    );

    const sendingToEmbrace = !!appID && isValidAppID(appID);

    if (!sendingToEmbrace && !logExporters.length && !spanExporters.length) {
      throw new Error(
        'when the embrace appID is omitted then at least one logExporter or spanExporter must be set'
      );
    }

    const userManager = setupUser();
    const enduserPseudoID = userManager.getUser()?.[KEY_ENDUSER_PSEUDO_ID];
    if (sendingToEmbrace && !enduserPseudoID) {
      throw new Error('userID is required when using Embrace exporter');
    }

    const spanSessionManager = setupSession();

    const tracerProvider = setupTraces({
      sendingToEmbrace,
      appID,
      enduserPseudoID,
      resource: resourceWithWebSDKAttributes,
      spanSessionManager,
      spanExporters,
      spanProcessors,
      propagator,
      contextManager,
    });

    const loggerProvider = setupLogs({
      sendingToEmbrace,
      appID,
      enduserPseudoID,
      resource: resourceWithWebSDKAttributes,
      logExporters,
      logProcessors,
      spanSessionManager,
    });

    // NOTE: we require setupInstrumentation to run the last, after setupLogs and setupTraces. This is how OTel works wrt
    // the dependencies between instrumentations and global providers. We need the providers for tracers, and logs to be
    // setup before we enable instrumentations.
    registerInstrumentations({
      instrumentations: [
        ...instrumentations,
        setupDefaultInstrumentations(defaultInstrumentationConfig),
      ],
    });

    return {
      flush: async () => {
        await tracerProvider.forceFlush();
        await loggerProvider.forceFlush();
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error.';
    diagLogger.error(`failed to initialize the SDK: ${message}`);
    return false;
  }
};

const setupUser = () => {
  const embraceUserManager = new EmbraceUserManager();
  user.setGlobalUserManager(embraceUserManager);
  return embraceUserManager;
};

const setupSession = () => {
  const embraceSpanSessionManager = new EmbraceSpanSessionManager();
  session.setGlobalSessionManager(embraceSpanSessionManager);
  return embraceSpanSessionManager;
};

interface SetupTracesArgs {
  sendingToEmbrace: boolean;
  appID?: string;
  enduserPseudoID?: string;
  resource: Resource;
  spanSessionManager: SpanSessionManager;
  spanExporters?: SpanExporter[];
  spanProcessors: SpanProcessor[];
  propagator?: TextMapPropagator | null;
  contextManager?: ContextManager | null;
}

const setupTraces = ({
  sendingToEmbrace,
  appID,
  enduserPseudoID,
  resource,
  spanSessionManager,
  spanExporters,
  spanProcessors = [],
  propagator = null,
  contextManager = null,
}: SetupTracesArgs) => {
  const finalSpanProcessors: SpanProcessor[] = [
    ...spanProcessors,
    createSessionSpanProcessor(spanSessionManager),
    new EmbraceNetworkSpanProcessor(),
  ];

  spanExporters?.forEach(exporter => {
    finalSpanProcessors.push(new BatchSpanProcessor(exporter));
  });

  if (sendingToEmbrace && appID && enduserPseudoID) {
    finalSpanProcessors.push(
      new EmbraceSessionBatchedSpanProcessor({
        exporter: new EmbraceTraceExporter({
          appID,
          userID: enduserPseudoID,
        }),
      })
    );
  }

  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: finalSpanProcessors,
  });

  tracerProvider.register({
    contextManager,
    propagator,
  });
  trace.setGlobalTracerProvider(tracerProvider);

  return tracerProvider;
};

interface SetupLogsArgs {
  sendingToEmbrace: boolean;
  appID?: string;
  enduserPseudoID?: string;
  resource: Resource;
  logExporters?: LogRecordExporter[];
  logProcessors: LogRecordProcessor[];
  spanSessionManager: SpanSessionManager;
}

const setupLogs = ({
  sendingToEmbrace,
  appID,
  enduserPseudoID,
  resource,
  logExporters,
  logProcessors,
  spanSessionManager,
}: SetupLogsArgs) => {
  const embraceLogManager = new EmbraceLogManager();
  log.setGlobalLogManager(embraceLogManager);

  const loggerProvider = new LoggerProvider({
    resource,
  });

  const finalLogProcessors: LogRecordProcessor[] = [
    ...logProcessors,
    new IdentifiableSessionLogRecordProcessor({
      spanSessionManager,
    }),
    new EmbTypeLogRecordProcessor(),
  ];

  logExporters?.forEach(exporter => {
    finalLogProcessors.push(new BatchLogRecordProcessor(exporter));
  });

  if (sendingToEmbrace && appID && enduserPseudoID) {
    finalLogProcessors.push(
      new BatchLogRecordProcessor(
        new EmbraceLogExporter({
          appID,
          userID: enduserPseudoID,
        })
      )
    );
  }

  for (const logProcessor of finalLogProcessors) {
    loggerProvider.addLogRecordProcessor(logProcessor);
  }

  logs.setGlobalLoggerProvider(loggerProvider);

  return loggerProvider;
};
