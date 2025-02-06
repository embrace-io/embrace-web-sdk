import { User } from '../../../api-users/provider/types.js';

export const isUser = (user: unknown | User): user is User =>
  typeof (user as User).id === 'string' && (user as User).id.length === 32;
