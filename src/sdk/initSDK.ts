import { diag } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from '@opentelemetry/sdk-logs';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-web';
import {
  BatchSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
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
import { setupDefaultInstrumentations } from './setupDefaultInstrumentations.js';
import { createSessionSpanProcessor } from '@opentelemetry/web-common';
import { log } from '../api-logs/index.js';
import type {
  SDKControl,
  SDKInitConfig,
  SetupLogsArgs,
  SetupTracesArgs,
} from './types.js';

export const initSDK = (
  {
    appID,
    appVersion,
    resource = Resource.empty(),
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
  }: SDKInitConfig = { appID: '' }
): SDKControl | false => {
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
