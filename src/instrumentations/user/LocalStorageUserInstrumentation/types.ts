import type { User } from '../../../api-users/manager/types.js';
import { KEY_ENDUSER_PSEUDO_ID } from '../../../api-users/manager/constants/index.js';

export const isUser = (user: unknown): user is User =>
  typeof (user as User)[KEY_ENDUSER_PSEUDO_ID] === 'string' &&
  (user as User)[KEY_ENDUSER_PSEUDO_ID].length === 32;
