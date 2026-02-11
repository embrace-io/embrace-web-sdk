// Prebundled @opentelemetry/otlp-transformer JSON serializers.
// Only exports items used by the SDK.

export type { ISerializer } from '@opentelemetry/otlp-transformer';
export {
  JsonLogsSerializer,
  JsonTraceSerializer,
} from '@opentelemetry/otlp-transformer';
