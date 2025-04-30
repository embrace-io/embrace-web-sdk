import { EMBRACE_APP_INSTANCE_ID_STORAGE_KEY } from './constants/index.js';
import { generateUUID } from '../utils/index.js';
import type { DiagLogger } from '@opentelemetry/api';

export const getAppInstanceId = (
  pageSessionStorage: Storage,
  diag: DiagLogger
) => {
  let id = null;
  try {
    id = pageSessionStorage.getItem(EMBRACE_APP_INSTANCE_ID_STORAGE_KEY);
  } catch (e) {
    diag.warn('Failed to retrieve app instance ID from session storage', e);
  }

  if (!id) {
    diag.debug(
      'No existing app instance ID found in session storage, creating a new one'
    );
    id = generateUUID();
    try {
      pageSessionStorage.setItem(EMBRACE_APP_INSTANCE_ID_STORAGE_KEY, id);
    } catch (e) {
      diag.warn('Failed to persist app instance ID to session storage', e);
    }
  }

  return id;
};
