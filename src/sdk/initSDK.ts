import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { emptyResource } from '@opentelemetry/resources';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from '@opentelemetry/sdk-logs';
import {
  BatchSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-web';
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
  EmbraceDynamicConfigManager,
  DEFAULT_LIMITS,
  EmbraceSDKFeaturesManager,
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
  DynamicSDKConfig,
  SDKControl,
  SDKInitConfig,
  SetupLogsArgs,
  SetupSessionArgs,
  SetupTracesArgs,
  SetupUserArgs,
} from './types.js';
import { registry } from './registry.js';
import { getDefaultAttributeScrubbers } from './defaultAttributeScrubbers.js';
import type { AttributeScrubber } from '../common/index.js';
import { OTelPerformanceManager } from '../utils/index.js';

export const initSDK = (
  {
    appID,
    appVersion,
    templateBundleID,
    resource = emptyResource(),
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
    embraceDataURL,
    embraceConfigURL,
    diagLogger = diag.createComponentLogger({
      namespace: 'embrace-sdk',
    }),
    dynamicSDKConfigManager: providedDynamicSDKConfigManager,
    dynamicSDKConfig,
    registerGlobally = true,
  }: SDKInitConfig = { appID: '' }
): SDKControl | false => {
  try {
    const perf = new OTelPerformanceManager();
    const initSDKStart = perf.getNowMillis();

    if (registerGlobally) {
      const existingSDK = registry.registered();
      if (existingSDK !== null) {
        diagLogger.warn(
          'SDK has already been successfully initialized, skipping this invocation of initSDK'
        );
        return existingSDK;
      }
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

    const userManager = setupUser({ registerGlobally });
    const enduserPseudoID = userManager.getEmbraceUserId();
    if (sendingToEmbrace && !enduserPseudoID) {
      throw new Error('userID is required when using Embrace exporter');
    }

    const dynamicConfigManager =
      providedDynamicSDKConfigManager ??
      new EmbraceDynamicConfigManager({
        appID,
        appVersion,
        embraceConfigURL,
        defaultConfig: dynamicSDKConfig,
        deviceId: enduserPseudoID,
      });
    void dynamicConfigManager.refreshRemoteConfig();

    const sdkFeaturesManager = new EmbraceSDKFeaturesManager({
      dynamicConfigManager,
      deviceId: enduserPseudoID,
    });

    if (!sdkFeaturesManager.isSDKEnabled()) {
      diagLogger.debug('SDK is disabled, skipping initialization.');

      return false;
    }

    const limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);

    const finalAttributeScrubbers: AttributeScrubber[] = [
      ...(enableDefaultAttributeScrubbing
        ? getDefaultAttributeScrubbers(additionalQueryParamsToScrub)
        : []),
      ...attributeScrubbers,
    ];

    const spanSessionManager = setupSession({
      limitManager,
      registerGlobally,
    });

    const { tracerProvider, embraceTraceManager } = setupTraces({
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
      embraceDataURL,
      registerGlobally,
    });

    spanSessionManager.setTracerProvider(tracerProvider);

    const { loggerProvider, embraceLogManager } = setupLogs({
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
      embraceDataURL,
      registerGlobally,
    });

    // NOTE: we require setupInstrumentation to run the last, after setupLogs and setupTraces. This is how OTel works wrt
    // the dependencies between instrumentations and global providers. We need the providers for tracers, and logs to be
    // setup before we enable instrumentations.
    if (!registerGlobally) {
      registerInstrumentations({
        tracerProvider,
        loggerProvider,
        instrumentations: [
          setupDefaultInstrumentations(defaultInstrumentationConfig, {
            diagLogger,
            logManager: embraceLogManager,
            spanSessionManager,
          }),
          ...instrumentations,
        ],
      });
    } else {
      registerInstrumentations({
        instrumentations: [
          setupDefaultInstrumentations(defaultInstrumentationConfig, {
            diagLogger,
          }),
          ...instrumentations,
        ],
      });
    }

    diagLogger.info('successfully initialized the SDK');

    const sdkControl: SDKControl = {
      setDynamicConfig: (config: Partial<DynamicSDKConfig>) => {
        dynamicConfigManager.setConfig(config);
      },
      flush: async () => {
        await tracerProvider.forceFlush();
        await loggerProvider.forceFlush();
      },
      log: embraceLogManager,
      trace: embraceTraceManager,
      session: spanSessionManager,
      user: userManager,
    };

    if (registerGlobally) {
      registry.register(sdkControl);
    }

    spanSessionManager.recordSDKStartupDuration(
      perf.getNowMillis() - initSDKStart
    );

    return sdkControl;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error.';
    diagLogger.error(`failed to initialize the SDK: ${message}`);
    return false;
  }
};

const setupUser = ({ registerGlobally }: SetupUserArgs) => {
  const embraceUserManager = new EmbraceUserManager();

  if (registerGlobally) {
    user.setGlobalUserManager(embraceUserManager);
  }

  return embraceUserManager;
};

const setupSession = ({ limitManager, registerGlobally }: SetupSessionArgs) => {
  const embraceSpanSessionManager = new EmbraceSpanSessionManager({
    limitManager,
  });

  if (registerGlobally) {
    session.setGlobalSessionManager(embraceSpanSessionManager);
  }

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
  embraceDataURL,
  registerGlobally,
}: SetupTracesArgs) => {
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
          embraceDataURL,
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

  const embraceTraceManager = new EmbraceTraceManager({
    tracerProvider: registerGlobally ? undefined : tracerProvider,
  });

  if (registerGlobally) {
    trace.setGlobalTraceManager(embraceTraceManager);
    tracerProvider.register({
      contextManager,
      propagator,
    });
  }

  return { tracerProvider, embraceTraceManager };
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
  embraceDataURL,
  registerGlobally,
}: SetupLogsArgs) => {
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
          embraceDataURL,
          userID: enduserPseudoID,
        })
      )
    );
  }

  const loggerProvider = new LoggerProvider({
    resource,
    processors: finalLogProcessors,
  });

  const embraceLogManager = new EmbraceLogManager({
    spanSessionManager,
    limitManager,
    loggerProvider: registerGlobally ? undefined : loggerProvider,
  });

  if (registerGlobally) {
    logs.setGlobalLoggerProvider(loggerProvider);
    log.setGlobalLogManager(embraceLogManager);
  }

  return { loggerProvider, embraceLogManager };
};
