import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-web';
import {
  ConsoleLogRecordExporter,
  type LogRecordProcessor,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';

interface SDKInitArgs {
  appID: string;
  embraceDataURL: string;
  embraceConfigURL: string;
  logLevel: number;
  registerGlobally?: boolean;
  spanProcessors?: SpanProcessor[];
  logProcessors?: LogRecordProcessor[];
}

interface SDKControl {
  log: {
    message: (txt: string, severity: string) => void;
  };
}

declare global {
  interface Window {
    EmbraceWebSdkOnReady: {
      q: Function[];
      onReady: (fn: Function) => void;
    };

    EmbraceWebSdk: {
      initSDK: (args: SDKInitArgs) => SDKControl;
    };
  }
}

let sdkControl: SDKControl | null = null;

const addEmbraceSDK = () => {
  window.EmbraceWebSdkOnReady = window.EmbraceWebSdkOnReady || {
    q: [],
    onReady: function (fn) {
      window.EmbraceWebSdkOnReady.q.push(fn);
    },
  };
  const script = document.createElement('script');
  script.async = true;
  script.src = '/bundle.js';
  script.onload = function () {
    // Call onReady immediately if the SDK is already loaded
    window.EmbraceWebSdkOnReady.onReady = function (fn) {
      fn();
    };
    window.EmbraceWebSdkOnReady.q.forEach(fn => fn());
    window.EmbraceWebSdkOnReady.q = [];
  };
  const firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode?.insertBefore(script, firstScript);
};

const initSDK = (appID: string) => {
  window.EmbraceWebSdkOnReady.onReady(() => {
    const { initSDK } = window.EmbraceWebSdk;
    sdkControl = initSDK({
      appID,
      embraceDataURL: `https://a-${appID}.data.stg.emb-eng.com`,
      embraceConfigURL: `https://a-${appID}.config.stg.emb-eng.com`,
      logLevel: 80,
      registerGlobally: false,
      spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
      logProcessors: [
        new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
      ],
    });

    console.log(`Embrace SDK initialized with appID: ${appID}`, sdkControl);
  });
};

export { addEmbraceSDK, initSDK, sdkControl };
