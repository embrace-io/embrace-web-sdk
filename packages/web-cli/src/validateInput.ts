import fs from 'node:fs';

// Validate the input parameters

interface ValidateInputArgs {
  buildPath: string;
  token?: string;
  appID: string;
  host: string;
  pathForUpload: string;
  storeType: string;
  appVersion?: string;
  cliVersion: string;
  templateAppVersion: string;
  upload: boolean;
}

export const validateInput = ({
  buildPath,
  token,
  appID,
  host,
  pathForUpload,
  storeType,
  cliVersion,
  appVersion,
  templateAppVersion,
  upload,
}: ValidateInputArgs): string | null => {
  if (!buildPath.trim()) {
    return 'buildPath cannot be empty.';
  }
  if (appVersion !== undefined) {
    const trimmedAppVersion = appVersion.trim();
    if (trimmedAppVersion === '') {
      return 'appVersion cannot be an empty string.';
    }
    if (trimmedAppVersion.length > 20) {
      return 'appVersion cannot be longer than 20 characters.';
    }
  }
  if (upload && !token?.trim()) {
    return 'Token cannot be empty.';
  }
  if (upload && token && token.length !== 32) {
    return 'Token must be 32 characters long.';
  }
  if (!appID.trim()) {
    return 'App ID cannot be empty.';
  }
  if (appID.length !== 5) {
    return 'App ID must be 5 characters long.';
  }
  if (!host.trim()) {
    return 'Host cannot be empty.';
  }
  if (!pathForUpload.trim()) {
    return 'Path cannot be empty.';
  }
  if (!storeType.trim()) {
    return 'Store type cannot be empty.';
  }
  if (!cliVersion.trim()) {
    return 'CLI version cannot be empty.';
  }
  if (!templateAppVersion.trim()) {
    return 'Template App version cannot be empty.';
  }
  if (templateAppVersion.length !== 20) {
    return 'Template App version must be 20 characters long.';
  }

  try {
    const pathStat = fs.statSync(buildPath);
    if (!pathStat.isDirectory()) {
      return 'buildPath needs to be a valid directory.';
    }
  } catch (_) {
    return 'buildPath not found.';
  }

  return null; // All validations passed
};
