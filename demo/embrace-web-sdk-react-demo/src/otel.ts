import {Resource} from '@opentelemetry/resources';
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import {trace} from '@opentelemetry/api';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {
  getWebSDKResource,
  SessionSpanProcessor,
} from '@embraceio/embrace-web-sdk';

const setupOTelSDK = () => {
  const resource = Resource.default().merge(getWebSDKResource());

  const consoleExporter = new ConsoleSpanExporter();
  const traceExporter = new OTLPTraceExporter({
    url: 'https://data.websdk.pablomatiasgomez.dev.emb-eng.com/v2/spans',
    headers: {
      'X-EMB-AID': 'ker2B',
      'X-EMB-DID': '018741D8E18447908A72222E7C002DB9',
    },
  });
  const sessionSpanProcessor = new SessionSpanProcessor(traceExporter);
  const consoleSpanProcessor = new SimpleSpanProcessor(consoleExporter);

  const tracerProvider = new WebTracerProvider({
    resource: resource,
    spanProcessors: [sessionSpanProcessor, consoleSpanProcessor],
  });

  tracerProvider.register();
  trace.setGlobalTracerProvider(tracerProvider);
};

export {setupOTelSDK};
