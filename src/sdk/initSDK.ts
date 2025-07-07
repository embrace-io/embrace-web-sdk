import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
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
import { user } from '../api-users/index.js';
import {
  EmbraceLogExporter,
  EmbraceTraceExporter,
} from '../exporters/index.js';
import {
  EmbraceLimitManager,
  EmbraceLogManager,
  EmbraceSpanSessionManager,
  EmbraceTraceManager,
  EmbraceUserManager,
  DEFAULT_LIMITS,
} from '../managers/index.js';
import {
  EmbraceNetworkSpanProcessor,
  EmbraceSessionBatchedSpanProcessor,
  EmbraceLogRecordProcessor,
  IdentifiableSessionLogRecordProcessor,
  UserSpanProcessor,
  UserLogRecordProcessor,
  LogRecordScrubProcessor,
  SpanScrubProcessor,
} from '../processors/index.js';
import { getWebSDKResource } from '../resources/index.js';
import { isValidAppID } from './utils.js';
import { setupDefaultInstrumentations } from './setupDefaultInstrumentations.js';
import { createSessionSpanProcessor } from '@opentelemetry/web-common';
import { log } from '../api-logs/index.js';
import { trace } from '../api-traces/index.js';
import type {
  SDKControl,
  SDKInitConfig,
  SetupLogsArgs,
  SetupSessionArgs,
  SetupTracesArgs,
} from './types.js';
import { registry } from './registry.js';
import { getDefaultAttributeScrubbers } from './defaultAttributeScrubbers.js';
import type { AttributeScrubber } from '../common/index.js';

export const initSDK = (
  {
    appID,
    appVersion,
    templateBundleID,
    resource = Resource.empty(),
    spanExporters = [],
    logExporters = [],
    spanProcessors = [],
    propagator = null,
    defaultInstrumentationConfig,
    instrumentations = [],
    contextManager = null,
    logProcessors = [],
    attributeScrubbers = [],
    enableDefaultAttributeScrubbing = true,
    additionalQueryParamsToScrub = [],
    logLevel = DiagLogLevel.ERROR,
    diagLogger = diag.createComponentLogger({
      namespace: 'embrace-sdk',
    }),
  }: SDKInitConfig = { appID: '' }
): SDKControl | false => {
  try {
    const existingSDK = registry.registered();
    if (existingSDK !== null) {
      diagLogger.warn(
        'SDK has already been successfully initialized, skipping this invocation of initSDK'
      );
      return existingSDK;
    }

    diag.setLogger(new DiagConsoleLogger(), {
      logLevel,
    });

    if (templateBundleID && templateBundleID.length !== 32) {
      throw new Error('templateBundleID should be 32 characters long');
    }

    const resourceWithWebSDKAttributes = resource.merge(
      getWebSDKResource({
        diagLogger,
        appVersion,
        templateBundleID,
        pageSessionStorage: window.sessionStorage,
      })
    );

    const sendingToEmbrace = !!appID && isValidAppID(appID);

    if (!sendingToEmbrace && !logExporters.length && !spanExporters.length) {
      throw new Error(
        'when the embrace appID is omitted then at least one logExporter or spanExporter must be set'
      );
    }

    const userManager = setupUser();
    const enduserPseudoID = userManager.getEmbraceUserId();
    if (sendingToEmbrace && !enduserPseudoID) {
      throw new Error('userID is required when using Embrace exporter');
    }

    const limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);
    const spanSessionManager = setupSession({
      limitManager,
    });

    const finalAttributeScrubbers: AttributeScrubber[] = [
      ...(enableDefaultAttributeScrubbing
        ? getDefaultAttributeScrubbers(additionalQueryParamsToScrub)
        : []),
      ...attributeScrubbers,
    ];

    const tracerProvider = setupTraces({
      sendingToEmbrace,
      appID,
      enduserPseudoID,
      resource: resourceWithWebSDKAttributes,
      spanSessionManager,
      userManager,
      spanExporters,
      spanProcessors,
      propagator,
      contextManager,
      limitManager,
      attributeScrubbers: finalAttributeScrubbers,
    });

    const loggerProvider = setupLogs({
      sendingToEmbrace,
      appID,
      enduserPseudoID,
      resource: resourceWithWebSDKAttributes,
      userManager,
      logExporters,
      logProcessors,
      spanSessionManager,
      limitManager,
      attributeScrubbers: finalAttributeScrubbers,
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

    diagLogger.info('successfully initialized the SDK');

    const sdkControl = {
      flush: async () => {
        await tracerProvider.forceFlush();
        await loggerProvider.forceFlush();
      },
    };

    registry.register(sdkControl);

    return sdkControl;
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

const setupSession = ({ limitManager }: SetupSessionArgs) => {
  const embraceSpanSessionManager = new EmbraceSpanSessionManager({
    limitManager,
  });
  session.setGlobalSessionManager(embraceSpanSessionManager);
  return embraceSpanSessionManager;
};

const setupTraces = ({
  sendingToEmbrace,
  appID,
  enduserPseudoID,
  resource,
  spanSessionManager,
  userManager,
  spanExporters,
  spanProcessors = [],
  propagator = null,
  contextManager = null,
  limitManager,
  attributeScrubbers,
}: SetupTracesArgs) => {
  const embraceTraceManager = new EmbraceTraceManager();
  trace.setGlobalTraceManager(embraceTraceManager);

  const finalSpanProcessors: SpanProcessor[] = [
    ...spanProcessors,
    createSessionSpanProcessor(spanSessionManager),
    new EmbraceNetworkSpanProcessor(),
    new UserSpanProcessor({ userManager }),
    new SpanScrubProcessor({ attributeScrubbers }),
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
        limitManager,
      })
    );
  }

  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: finalSpanProcessors,
    spanLimits: {
      // Session properties are stored as attributes on the session span, add a
      // buffer here so that there is room for our internal attributes
      attributeCountLimit: DEFAULT_LIMITS.maxAllowed.session_property * 2,
      attributePerEventCountLimit: 20,
      // Breadcrumbs are stored as events on the session span, add a
      // buffer here so that there is room for our internal events
      eventCountLimit: DEFAULT_LIMITS.maxAllowed.breadcrumb * 2,
      attributeValueLengthLimit: 1024,
    },
  });

  tracerProvider.register({
    contextManager,
    propagator,
  });

  return tracerProvider;
};

const setupLogs = ({
  sendingToEmbrace,
  appID,
  enduserPseudoID,
  resource,
  userManager,
  logExporters,
  logProcessors,
  spanSessionManager,
  limitManager,
  attributeScrubbers,
}: SetupLogsArgs) => {
  const embraceLogManager = new EmbraceLogManager({
    spanSessionManager,
    limitManager,
  });
  log.setGlobalLogManager(embraceLogManager);

  const loggerProvider = new LoggerProvider({
    resource,
  });

  const finalLogProcessors: LogRecordProcessor[] = [
    ...logProcessors,
    new IdentifiableSessionLogRecordProcessor({
      spanSessionManager,
    }),
    new EmbraceLogRecordProcessor(),
    new UserLogRecordProcessor({ userManager }),
    new LogRecordScrubProcessor({ attributeScrubbers }),
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
