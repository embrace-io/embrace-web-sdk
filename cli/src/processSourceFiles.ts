import { validateInput } from './validateInput.js';
import fs from 'fs';
import crypto from 'crypto';
import { uploadToApi } from './uploadToApi.js';

interface ProcessSourceFilesArgs {
  jsFilePath: string;
  mapFilePath: string;
  token: string;
  appID: string;
  host: string;
  pathForUpload: string;
  storeType: string;
  cliVersion: string;
  templateBundleID: string;
  fileEncoding: BufferEncoding;
  dryRun: boolean;
  replaceBundleID: boolean;
  upload: boolean;
}

export async function processSourceFiles({
  jsFilePath,
  mapFilePath,
  token,
  appID,
  host,
  pathForUpload,
  storeType,
  cliVersion,
  templateBundleID,
  dryRun,
  replaceBundleID,
  upload,
  fileEncoding,
}: ProcessSourceFilesArgs): Promise<void> {
  const validationError = validateInput({
    jsFilePath,
    mapFilePath,
    token,
    appID,
    host,
    pathForUpload,
    storeType,
    cliVersion,
    templateBundleID,
  });
  if (validationError) {
    console.error('Input Validation Error: ', validationError);
    process.exit(1); // Exit with error code
  }

  try {
    // load files content
    const jsContent = fs.readFileSync(jsFilePath, fileEncoding);
    const mapContent = fs.readFileSync(mapFilePath, fileEncoding);

    // generate 32 chars long hash from the js content using md5
    const bundleID = crypto.createHash('md5').update(jsContent).digest('hex');
    console.log(`Generated bundleID ${bundleID}`);

    // replace the injected template bundle ID with the generated bundle ID in the source code
    const newJsContent = jsContent.replace(templateBundleID, bundleID);
    const newMapContent = mapContent.replace(templateBundleID, bundleID);

    if (newJsContent === jsContent || newMapContent === mapContent) {
      console.error('Template bundle ID not found in the source code');
      process.exit(1); // Exit with error code
    }
    // write the updated source code back to the file
    if (!dryRun && replaceBundleID) {
      fs.writeFileSync(jsFilePath, newJsContent, fileEncoding);
      fs.writeFileSync(mapFilePath, newMapContent, fileEncoding);
    }

    // upload the files to the Embrace API
    await uploadToApi({
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
      upload,
    });
    console.log(`Uploaded ${jsFilePath} and ${mapFilePath}`);
  } catch (err) {
    console.error('Error processing files:', err);
    process.exit(1); // Exit with error code
  }
}
