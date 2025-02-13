import zlib from 'zlib';

interface UploadToApiArgs {
  jsContent: string;
  mapContent: string;
  bundleID: string;
  token: string;
  appID: string;
  host: string;
  pathForUpload: string;
  storeType: string;
  cliVersion: string;
  dryRun: boolean;
}

export async function uploadToApi({
  jsContent,
  mapContent,
  bundleID,
  token,
  appID,
  host,
  pathForUpload,
  storeType,
  cliVersion,
  dryRun,
}: UploadToApiArgs): Promise<void> {
  // prepare the body for the API request as a gzipped JSON object
  const body = new Blob([
    zlib.gzipSync(
      JSON.stringify({
        bundle: jsContent,
        sourcemap: mapContent,
      })
    ),
  ]);
  // prepare the multipart form data for transfer
  const formData = new FormData();
  formData.append('id', bundleID);
  formData.append('app', appID);
  formData.append('token', token);
  formData.append('file', body);
  if (dryRun) {
    return;
  }
  try {
    console.log(`Uploading to API bundle ID ${bundleID}, appID ${appID}`);
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
        `API returned ${response.status}: ${response.statusText} - ${errorText}`
      );
    }

    console.log('API Response status:', response.status);
  } catch (error) {
    console.error('Error uploading to API:', error);
    throw error;
  }
}
