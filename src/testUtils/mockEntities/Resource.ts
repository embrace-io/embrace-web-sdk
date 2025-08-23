import type { Resource } from '@opentelemetry/resources';

export const mockResource: Resource = {
  attributes: {},
  merge: (_: Resource | null): Resource => mockResource,
  getRawAttributes: () => [],
};
