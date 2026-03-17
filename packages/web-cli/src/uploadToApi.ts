import zlib from 'node:zlib';
import { log } from './log.ts';

interface UploadToApiArgs {
  jsContent: string;
  mapContent: string;
  bundleID: string;
  token?: string;
  appID: string;
  host: string;
  pathForUpload: string;
  storeType: string;
  cliVersion: string;
}

export const uploadToApi = async ({
  jsContent,
  mapContent,
  bundleID,
  token,
  appID,
  host,
  pathForUpload,
  storeType,
  cliVersion,
}: UploadToApiArgs): Promise<void> => {
  if (!token) {
    throw new Error('Token is required for upload');
  }

  // prepare the body for the API request as a gzipped JSON object
  const body = new Blob([
    zlib.gzipSync(
      JSON.stringify({
        bundle: jsContent,
        sourcemap: mapContent,
      }),
    ),
  ]);
  // prepare the multipart form data for transfer
  const formData = new FormData();
  formData.append('id', bundleID);
  formData.append('app', appID);
  formData.append('token', token);
  formData.append('file', body);

  try {
    log.dim(`    uploading bundle ${bundleID.substring(0, 8)}, app ${appID}`);
    const response = await fetch(host + pathForUpload + storeType, {
      method: 'POST',
      headers: {
        'User-Agent': `embrace_symbol_upload/${cliVersion} (${process.version})`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API returned ${response.status.toString()}: ${response.statusText} - ${errorText}`,
      );
    }

    log.dim(`    API response: ${response.status.toString()}`);
  } catch (error) {
    log.error(
      `    upload failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
};
