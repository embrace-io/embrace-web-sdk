import type { DiagLogger } from '@opentelemetry/api';
import type { NamespacedStorage } from '../utils/index.ts';
import { generateUUID } from '../utils/index.ts';
import { EMBRACE_APP_INSTANCE_ID_STORAGE_KEY } from './constants/index.ts';

export const getAppInstanceId = (
  tabStorage: NamespacedStorage,
  diag: DiagLogger,
): string => {
  const existing = tabStorage.getItem(EMBRACE_APP_INSTANCE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  diag.debug(
    'No existing app instance ID found in session storage, creating a new one',
  );
  const id = generateUUID();
  tabStorage.setItem(EMBRACE_APP_INSTANCE_ID_STORAGE_KEY, id);
  return id;
};
