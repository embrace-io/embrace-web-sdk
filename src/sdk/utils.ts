import { TEMPLATE_APP_VERSION } from '../resources/constants/index.ts';

export const validateAppID = (appID: unknown): string | undefined => {
  if (appID === undefined || appID === '') return undefined;
  if (typeof appID !== 'string') {
    throw new Error(`appID must be a string. Received ${String(appID)}.`);
  }
  if (appID.length !== 5) {
    throw new Error(`appID should be 5 characters long. Received ${appID}`);
  }
  return appID;
};

export const validateAppVersion = (appVersion: unknown): string => {
  if (appVersion === undefined) {
    // TEMPLATE_APP_VERSION is rewritten by the CLI at build time and may be empty
    const trimmedTemplate = TEMPLATE_APP_VERSION.trim();
    if (trimmedTemplate === '') {
      return 'unspecified';
    }
    return trimmedTemplate;
  }
  if (typeof appVersion !== 'string') {
    throw new Error(
      `appVersion must be a string. Received ${String(appVersion)}.`,
    );
  }
  const trimmedAppVersion = appVersion.trim();
  if (trimmedAppVersion === '') {
    throw new Error('appVersion cannot be empty.');
  }
  return trimmedAppVersion;
};
