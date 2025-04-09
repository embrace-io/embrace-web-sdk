import { validateInput } from './validateInput.js';
import fs from 'fs';
import crypto from 'crypto';
import { uploadToApi } from './uploadToApi.js';

interface ProcessSourceFilesArgs {
  jsFilePath: string;
  mapFilePath: string;
  token: string;
  appID: string;
  appVersion: string;
  host: string;
  pathForUpload: string;
  storeType: string;
  cliVersion: string;
  templateAppVersion: string;
  templateBundleID: string;
  fileEncoding: BufferEncoding;
  dryRun: boolean;
  replaceBundleID: boolean;
  upload: boolean;
}

export const processSourceFiles = async ({
  jsFilePath,
  mapFilePath,
  token,
  appID,
  host,
  pathForUpload,
  storeType,
  cliVersion,
  templateBundleID,
  templateAppVersion,
  dryRun,
  replaceBundleID,
  upload,
  fileEncoding,
  appVersion,
}: ProcessSourceFilesArgs): Promise<void> => {
  const validationError = validateInput({
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
  });
  if (validationError) {
    console.error('Input Validation Error: ', validationError);
    process.exit(1); // Exit with error code
  }

  try {
    // load files content
    let jsContent = fs.readFileSync(jsFilePath, fileEncoding);
    let mapContent = fs.readFileSync(mapFilePath, fileEncoding);

    // inject the appVersion into the source code
    // for that, generate a 20 chars long appVersion by adding leading spaces to the appVersion
    // if it is less than 20 chars long
    const appVersionLength = appVersion.length;
    if (appVersionLength < 20) {
      appVersion = appVersion.padStart(20, ' ');
    }
    let newJsContent = jsContent.replace(templateAppVersion, appVersion);
    let newMapContent = mapContent.replace(templateAppVersion, appVersion);

    if (newJsContent === jsContent || newMapContent === mapContent) {
      console.error('Template App version not found in the source code');
      process.exit(1); // Exit with error code
    }

    // save the content to the base vars for later processing
    jsContent = newJsContent;
    mapContent = newMapContent;

    // generate 32 chars long hash from the js content using md5
    const bundleID = crypto.createHash('md5').update(jsContent).digest('hex');
    console.log(`Generated bundleID ${bundleID}`);

    // replace the injected template bundle ID with the generated bundle ID in the source code
    newJsContent = jsContent.replace(templateBundleID, bundleID);
    newMapContent = mapContent.replace(templateBundleID, bundleID);

    if (newJsContent === jsContent || newMapContent === mapContent) {
      console.error('Template bundle ID not found in the source code');
      process.exit(1); // Exit with error code
    }

    // save the content to the base vars for later processing
    jsContent = newJsContent;
    mapContent = newMapContent;
    console.log(
      replaceBundleID && !dryRun
        ? 'Replacing the template bundle ID with the generated bundle ID'
        : 'Dry run mode, not replacing the template bundle ID'
    );
    // write the updated source code back to the file
    if (!dryRun && replaceBundleID) {
      fs.writeFileSync(jsFilePath, jsContent, fileEncoding);
      fs.writeFileSync(mapFilePath, mapContent, fileEncoding);
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
};
