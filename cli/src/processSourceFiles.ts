import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { uploadToApi } from './uploadToApi.js';
import { validateInput } from './validateInput.js';

class MapSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapSecurityError';
  }
}

// The un-minified version of FILE_BUNDLE_IDS_CODE_SNIPPET lives in cli/snippet/fileBundleIDsSnippet.js
const FILE_BUNDLE_ID_CODE_SNIPPET_TEMPLATE = 'EmbIOFileBundleID';
const FILE_BUNDLE_IDS_CODE_SNIPPET = `!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},l=(new e.Error).stack;l&&(e._EmbraceFileBundleIDs=e._EmbraceFileBundleIDs||{},e._EmbraceFileBundleIDs[l]="${FILE_BUNDLE_ID_CODE_SNIPPET_TEMPLATE}")}catch(e){}}();`;

interface SourceMap {
  version: number;
  file: string;
  sources: string[];
  names: string[];
  mappings: string;
  debugId: string;
}

interface ProcessSourceFilesArgs {
  buildPath: string;
  token: string;
  appID: string;
  appVersion: string;
  host: string;
  pathForUpload: string;
  storeType: string;
  cliVersion: string;
  templateAppVersion: string;
  fileEncoding: BufferEncoding;
  dryRun: boolean;
  replaceBundleID: boolean;
  upload: boolean;
}

const UUID_WITH_HYPHENS_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UUID_WITHOUT_HYPHENS_REGEX = /^[0-9a-fA-F]{32}$/;
const UUID_PARTS_REGEX =
  /([0-9a-fA-F]{8})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{4})([0-9a-fA-F]{12})/;
const addHyphensToUuid = (uuidStr: string): string => {
  // Ensure the input string is exactly 32 characters long and contains only hexadecimal digits
  if (!UUID_WITHOUT_HYPHENS_REGEX.test(uuidStr)) {
    throw new Error('Invalid UUID string: Must be 32 hexadecimal characters.');
  }

  // Use replace with a regex to insert hyphens at the correct positions
  return uuidStr.replace(UUID_PARTS_REGEX, '$1-$2-$3-$4-$5');
};

const injectBundleIDToSourceFile = (sourceFile: string, bundleID: string) => {
  const jsLines = sourceFile.split('\n');
  const sourceMapCommentIndex = jsLines.findIndex((line) =>
    line.trim().startsWith('//# sourceMappingURL='),
  );

  // Insert the snippet right before the sourceMapComment, or at the end if not found.
  const injectIndex =
    sourceMapCommentIndex === -1 ? jsLines.length : sourceMapCommentIndex;
  const snippet = FILE_BUNDLE_IDS_CODE_SNIPPET.replace(
    FILE_BUNDLE_ID_CODE_SNIPPET_TEMPLATE,
    bundleID,
  );
  jsLines.splice(injectIndex, 0, snippet);
  jsLines.splice(injectIndex, 0, '// Injected by Embrace Web CLI:');

  return jsLines.join('\n');
};

const extractSourceMapUrl = (jsContent: string): string | null => {
  const match = jsContent.match(/^\/\/# sourceMappingURL=(.+)$/m);
  const url = match?.[1]?.trim();
  return url || null;
};

const findSourceMapForJsFile = (
  jsFileName: string,
  jsContent: string,
  realPath: string,
): string | null => {
  const sourceMapUrl = extractSourceMapUrl(jsContent);
  if (sourceMapUrl) return sourceMapUrl;

  // Fallback to .js.map
  const fallbackMapPath = `${jsFileName}.map`;
  const fallbackMapFilePath = path.join(realPath, fallbackMapPath);

  if (fs.existsSync(fallbackMapFilePath)) {
    console.log(
      `Using fallback source map ${fallbackMapPath} for ${jsFileName}`,
    );
    return fallbackMapPath;
  }

  return null;
};

const validateMapSecurity = (
  mapFilePath: string,
  searchRoot: string,
  sourceMapUrl: string,
  jsFileName: string,
): void => {
  const mapFileRealPath = fs.realpathSync(mapFilePath);
  const relativePath = path.relative(searchRoot, mapFileRealPath);

  // Check if the relative path escapes the search root
  // - Starts with '..' means it goes up and out of the root
  // - Being absolute means it's on a different drive/root (Windows)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new MapSecurityError(
      `Source map '${sourceMapUrl}' in ${jsFileName} resolves outside the search directory (${mapFileRealPath} is not within ${searchRoot}). This is not allowed to prevent path traversal attacks.`,
    );
  }
};

export const findJSFilesRecursively = (
  dirPath: string,
  rootPath?: string,
): Array<{ jsFilePath: string; mapFilePath: string }> => {
  const results: Array<{ jsFilePath: string; mapFilePath: string }> = [];

  // Get real path to handle symlinks and normalize to absolute path
  const realPath = fs.realpathSync(dirPath);
  // Track the original root directory for security checks
  const searchRoot = rootPath ?? realPath;

  const files = fs.readdirSync(realPath);
  const jsFiles = files.filter((file) => file.endsWith('.js'));

  // Process JS files in current directory
  for (const jsFileName of jsFiles) {
    const jsFilePath = path.join(realPath, jsFileName);

    try {
      const jsContent = fs.readFileSync(jsFilePath, 'utf-8');
      const sourceMapUrl = findSourceMapForJsFile(
        jsFileName,
        jsContent,
        realPath,
      );

      if (!sourceMapUrl) {
        console.warn(`Skipping ${jsFileName} - no source map found`);
        continue;
      }

      const mapFilePath = path.resolve(realPath, sourceMapUrl);

      if (!fs.existsSync(mapFilePath)) {
        console.warn(
          `Skipping ${jsFileName} - source map file not found at ${mapFilePath}`,
        );
        continue;
      }

      validateMapSecurity(mapFilePath, searchRoot, sourceMapUrl, jsFileName);

      results.push({ jsFilePath, mapFilePath });
    } catch (err) {
      // Rethrow security errors - these should fail the entire process
      if (err instanceof MapSecurityError) {
        throw err;
      }
      // For other errors, just warn and continue
      console.warn(`Error reading ${jsFileName}:`, err);
    }
  }

  // Recursively process subdirectories
  for (const file of files) {
    const fullPath = path.join(realPath, file);

    try {
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        results.push(...findJSFilesRecursively(fullPath, searchRoot));
      }
    } catch (err) {
      console.warn(`Error reading ${fullPath}:`, err);
    }
  }

  return results;
};

export const processSourceFiles = async ({
  buildPath,
  token,
  appID,
  host,
  pathForUpload,
  storeType,
  cliVersion,
  templateAppVersion,
  dryRun,
  replaceBundleID,
  upload,
  fileEncoding,
  appVersion,
}: ProcessSourceFilesArgs): Promise<void> => {
  const validationError = validateInput({
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
  });
  if (validationError) {
    console.error('Input Validation Error: ', validationError);
    process.exit(1); // Exit with error code
  }

  // Validate that path is a directory
  const stats = fs.statSync(buildPath);
  if (!stats.isDirectory()) {
    console.error(`Path must be a directory: ${buildPath}`);
    process.exit(1); // Exit with error code
  }

  try {
    // Recursively find all .js files with corresponding .js.map files
    const jsFiles = findJSFilesRecursively(buildPath);

    console.log(
      `Found ${jsFiles.length} JavaScript files in directory tree: ${buildPath}`,
    );

    let appVersionReplaced = false;
    for (const { jsFilePath, mapFilePath } of jsFiles) {
      console.log(`Processing ${jsFilePath} and ${mapFilePath}...`);

      // load files content
      let jsContent = fs.readFileSync(jsFilePath, fileEncoding);
      let mapContent = fs.readFileSync(mapFilePath, fileEncoding);

      // if an app version is provided, inject it into the source code
      if (appVersion) {
        // generate a 20 chars long appVersion by adding leading spaces to the appVersion
        const paddedAppVersion =
          appVersion.length < 20 ? appVersion.padStart(20, ' ') : appVersion;
        const newJsContent = jsContent.replace(
          templateAppVersion,
          paddedAppVersion,
        );
        const newMapContent = mapContent.replace(
          templateAppVersion,
          paddedAppVersion,
        );

        if (newJsContent === jsContent && newMapContent === mapContent) {
          console.debug(`Template App version not found in ${jsFilePath}`);
        } else {
          appVersionReplaced = true;
        }

        // save the content to the base vars for later processing
        jsContent = newJsContent;
        mapContent = newMapContent;
      }

      // Now inject the debug_id:
      let bundleID = ''; // BundleID does not have hyphens. E.g. cf3c7caa072c4b2283bc691d71e49bcd
      let debugID = ''; // DebugID has hyphens. E.g. cf3c7caa-072c-4b22-83bc-691d71e49bcd
      const sourceMap = JSON.parse(mapContent) as SourceMap;

      // If the sourcemap already has a debug_id use that, otherwise we generate it.
      // Given that the debug_id specification (https://github.com/tc39/ecma426/blob/main/proposals/debug-id.md#debug-ids)
      // uses hyphens, and our bundle_id does not, we need to have the two variables separately.
      if (sourceMap.debugId) {
        if (!UUID_WITH_HYPHENS_REGEX.test(sourceMap.debugId)) {
          throw new Error(
            `SourceMap file at ${mapFilePath} contains a debugID that is not a valid UUID string: '${sourceMap.debugId}'.\nIf you are generating these debugIDs manually, you should make sure the generated ids are valid UUIDs.\nIf you are using a build tool that generates these ids, we suggest that you disable that, and our cli will generate them automatically.`,
          );
        }
        bundleID = sourceMap.debugId.replaceAll('-', '');
        debugID = sourceMap.debugId;
        console.log(
          `Using debugID ${debugID} from sourceMap for ${jsFilePath}`,
        );
      } else {
        bundleID = crypto.createHash('md5').update(jsContent).digest('hex'); // No hyphens
        debugID = addHyphensToUuid(bundleID);
        sourceMap.debugId = debugID;
        mapContent = JSON.stringify(sourceMap);
        console.log(`Generated debugID ${debugID} for ${jsFilePath}`);
      }

      // Inject the file->bundleID map snippet:
      jsContent = injectBundleIDToSourceFile(jsContent, bundleID);

      console.log(
        `${replaceBundleID && !dryRun ? 'Replacing' : 'Dry run mode, not replacing'} the contents for ${jsFilePath} and ${mapFilePath}`,
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
    }

    // If the app version was provided, but it couldn't be replaced in any of the files, exit with error.
    if (appVersion && !appVersionReplaced) {
      console.error(
        `Template App version not found in any of the js files. Exiting.`,
      );
      process.exit(1); // Exit with error code
    }
  } catch (err) {
    console.error('Error processing files:', err);
    process.exit(1); // Exit with error code
  }
};
