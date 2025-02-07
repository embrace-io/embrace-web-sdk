import { User } from '../../../api-users/provider/types.js';
import { KEY_ENDUSER_PSEUDO_ID } from '../../../api-users/provider/constants/index.js';

export const isUser = (user: unknown | User): user is User =>
  typeof (user as User)[KEY_ENDUSER_PSEUDO_ID] === 'string' &&
  (user as User)[KEY_ENDUSER_PSEUDO_ID].length === 32;
