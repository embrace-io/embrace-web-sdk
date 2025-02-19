import fs from 'fs';

// Validate the input parameters

interface ValidateInputArgs {
  jsFilePath: string;
  mapFilePath: string;
  token: string;
  appID: string;
  host: string;
  pathForUpload: string;
  storeType: string;
  appVersion: string;
  cliVersion: string;
  templateBundleID: string;
  templateAppVersion: string;
}

export function validateInput({
  jsFilePath,
  mapFilePath,
  token,
  appID,
  host,
  pathForUpload,
  storeType,
  cliVersion,
  appVersion,
  templateBundleID,
  templateAppVersion,
}: ValidateInputArgs): string | null {
  if (!jsFilePath.trim()) {
    return 'JS file path cannot be empty.';
  }
  if (!appVersion.trim()) {
    return 'appVersion cannot be empty.';
  }
  if (appVersion.length > 20) {
    return 'appVersion cannot be longer than 20 characters.';
  }
  if (!mapFilePath.trim()) {
    return 'Map file path cannot be empty.';
  }
  if (!token.trim()) {
    return 'Token cannot be empty.';
  }
  if (token.length !== 32) {
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
  if (!templateBundleID.trim()) {
    return 'Template bundle ID cannot be empty.';
  }
  if (templateBundleID.length !== 32) {
    return 'Template bundle ID must be 32 characters long.';
  }
  if (!templateAppVersion.trim()) {
    return 'Template App version cannot be empty.';
  }
  if (templateAppVersion.length !== 20) {
    return 'Template App version must be 20 characters long.';
  }

  try {
    const jsStats = fs.statSync(jsFilePath);
    if (!jsStats.isFile() || jsStats.size === 0) {
      return 'JS file is not a valid file or is empty.';
    }
  } catch (_) {
    return 'JS file not found.';
  }

  try {
    const mapStats = fs.statSync(mapFilePath);
    if (!mapStats.isFile() || mapStats.size === 0) {
      return 'Map file is not a valid file or is empty.';
    }
  } catch (_) {
    return 'Map file not found.';
  }

  return null; // All validations passed
}
