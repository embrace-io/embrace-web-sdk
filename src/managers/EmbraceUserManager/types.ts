import type { DiagLogger } from '@opentelemetry/api';
import type { User } from '../../api-users/index.js';
import { KEY_ENDUSER_PSEUDO_ID } from '../../api-users/index.js';

export interface EmbraceUserManagerArgs {
  diag?: DiagLogger;
  storage?: Storage;
}

export const isUser = (user: unknown): user is User =>
  typeof (user as User)[KEY_ENDUSER_PSEUDO_ID] === 'string' &&
  (user as User)[KEY_ENDUSER_PSEUDO_ID].length === 32;
