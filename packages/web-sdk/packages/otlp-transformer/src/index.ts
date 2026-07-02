// biome-ignore-all lint/performance/noBarrelFile: package entry point consumed via the #embrace-io/otlp-transformer subpath.
// Prebundled @opentelemetry/otlp-transformer JSON serializers.
// Only exports items used by the SDK.

export type { ISerializer } from '@opentelemetry/otlp-transformer';
export {
  JsonLogsSerializer,
  JsonTraceSerializer,
} from '@opentelemetry/otlp-transformer';
