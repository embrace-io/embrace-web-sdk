import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider,
} from "@opentelemetry/sdk-trace-web";
import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const setupOTelSDK = () => {
  const resource = Resource.default().merge(
    new Resource({
      [ATTR_SERVICE_NAME]: "react-client",
    }),
  );

  const consoleExporter = new ConsoleSpanExporter();
  const traceExporter = new OTLPTraceExporter({
    url: "http://localhost:7070/v1/traces",
    headers: {},
  });
  const simpleSpanProcessor = new SimpleSpanProcessor(traceExporter);
  const consoleSpanProcessor = new SimpleSpanProcessor(consoleExporter);

  const tracerProvider = new WebTracerProvider({
    resource: resource,
    spanProcessors: [simpleSpanProcessor, consoleSpanProcessor]
  });

  tracerProvider.register();
  trace.setGlobalTracerProvider(tracerProvider);
};

export { setupOTelSDK };
