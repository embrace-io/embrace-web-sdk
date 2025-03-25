import type { IResource } from '@opentelemetry/resources';

export const mockIResource: IResource = {
  attributes: {},
  merge: (_: IResource | null): IResource => mockIResource
};
