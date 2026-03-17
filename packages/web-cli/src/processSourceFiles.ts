import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { log } from './log.ts';
import { uploadToApi } from './uploadToApi.ts';
import { validateInput } from './validateInput.ts';

class MapSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapSecurityError';
  }
}

// The un-minified version of FILE_BUNDLE_IDS_CODE_SNIPPET lives in packages/web-cli/snippet/fileBundleIDsSnippet.js
// To regenerate the minified version, run: npx terser ./packages/web-cli/snippet/fileBundleIDsSnippet.js -c -m
export const FILE_BUNDLE_ID_CODE_SNIPPET_TEMPLATE = 'EmbIOFileBundleID';
export const FILE_BUNDLE_IDS_CODE_SNIPPET = `;(E=>{try{const _=globalThis,c=(new _.Error).stack;c&&(_[E]=_[E]||{},_[E][c]="${FILE_BUNDLE_ID_CODE_SNIPPET_TEMPLATE}")}catch(E){}})("_EmbraceFileBundleIDs");`;
const INJECTION_MARKER = '// Injected by Embrace Web CLI:';

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
  token?: string;
  appID: string;
  appVersion?: string;
  host: string;
  pathForUpload: string;
  storeType: string;
  cliVersion: string;
  templateAppVersion: string;
  fileEncoding: BufferEncoding;
  dryRun?: boolean;
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

export const isAlreadyInjected = (sourceFile: string): boolean => {
  return sourceFile.includes(INJECTION_MARKER);
};

const diagnoseInvalidDebugId = (debugId: string): string => {
  // Check if it's a valid UUID without hyphens
  if (UUID_WITHOUT_HYPHENS_REGEX.test(debugId)) {
    const withHyphens = addHyphensToUuid(debugId);
    return `UUID is missing hyphens. Expected format: ${withHyphens}`;
  }

  // Check length
  const stripped = debugId.replace(/-/g, '');
  if (stripped.length !== 32) {
    return `UUID must be 32 hex characters (got ${stripped.length.toString()})`;
  }

  // Check for invalid characters
  if (!/^[0-9a-fA-F-]+$/.test(debugId)) {
    return 'UUID contains invalid characters (only 0-9, a-f, A-F, and hyphens allowed)';
  }

  // Wrong hyphen placement
  return 'UUID has incorrect format. Expected: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
};

export const injectBundleIDToSourceFile = (
  sourceFile: string,
  bundleID: string,
) => {
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
  jsLines.splice(injectIndex, 0, INJECTION_MARKER);

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
    log.dim(`    using fallback source map ${fallbackMapPath}`);
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
        log.warn(`Skipping ${jsFileName} - no source map found`);
        continue;
      }

      const mapFilePath = path.resolve(realPath, sourceMapUrl);

      if (!fs.existsSync(mapFilePath)) {
        log.warn(
          `Skipping ${jsFileName} - map file not found at ${mapFilePath}`,
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
      log.warn(
        `Error reading ${jsFileName}: ${err instanceof Error ? err.message : String(err)}`,
      );
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
      log.warn(
        `Error reading ${fullPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
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
    log.error(`Validation error: ${validationError}`);
    process.exit(1);
  }

  // Validate that path is a directory
  const stats = fs.statSync(buildPath);
  if (!stats.isDirectory()) {
    log.error(`Path must be a directory: ${buildPath}`);
    process.exit(1);
  }

  const rootPath = fs.realpathSync(buildPath);
  const relativePath = (absPath: string) => path.relative(rootPath, absPath);

  try {
    // Recursively find all .js files with corresponding .js.map files
    const jsFiles = findJSFilesRecursively(buildPath);

    if (jsFiles.length === 0) {
      if (appVersion) {
        log.error('Template app version not found in any files');
        process.exit(1);
      }
      log.warn('No JavaScript files with source maps found');
      return;
    }

    log.info(`Found ${jsFiles.length} files with source maps in ${buildPath}`);

    if (dryRun) {
      log.warn('Dry run mode - no files will be modified or uploaded');
    }

    let appVersionFile: string | null = null;
    let processed = 0;
    let debugIdsGenerated = 0;

    for (const { jsFilePath, mapFilePath } of jsFiles) {
      const relJs = relativePath(jsFilePath);
      const relMap = relativePath(mapFilePath);

      // Print file being processed
      log.info(relJs);

      // load files content
      let jsContent = fs.readFileSync(jsFilePath, fileEncoding);
      let mapContent = fs.readFileSync(mapFilePath, fileEncoding);

      // Source map info
      log.dim(`    sourcemap: ${relMap}`);

      // if an app version is provided, inject it into the source code
      let thisFileVersionReplaced = false;
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

        if (newJsContent !== jsContent || newMapContent !== mapContent) {
          appVersionFile = relJs;
          thisFileVersionReplaced = true;
        }

        // save the content to the base vars for later processing
        jsContent = newJsContent;
        mapContent = newMapContent;
      }

      // App version status - only show when template found
      if (appVersion && thisFileVersionReplaced) {
        log.bold(`    app version: ${appVersion}`);
      }

      // Now inject the debug_id:
      let bundleID = ''; // BundleID does not have hyphens. E.g. cf3c7caa072c4b2283bc691d71e49bcd
      let debugID = ''; // DebugID has hyphens. E.g. cf3c7caa-072c-4b22-83bc-691d71e49bcd
      let debugIdSource = '';
      const sourceMap = JSON.parse(mapContent) as SourceMap;

      // If the sourcemap already has a debug_id use that, otherwise we generate it.
      // Given that the debug_id specification (https://github.com/tc39/ecma426/blob/main/proposals/debug-id.md#debug-ids)
      // uses hyphens, and our bundle_id does not, we need to have the two variables separately.
      if (sourceMap.debugId) {
        if (!UUID_WITH_HYPHENS_REGEX.test(sourceMap.debugId)) {
          const diagnosis = diagnoseInvalidDebugId(sourceMap.debugId);
          throw new Error(
            `Invalid debugId in ${relMap}: ${diagnosis}\nIf a build tool generated this, consider disabling its debugId generation so the CLI can generate them automatically.`,
          );
        }
        bundleID = sourceMap.debugId.replaceAll('-', '');
        debugID = sourceMap.debugId;
        debugIdSource = 'existing';
      } else {
        bundleID = crypto.createHash('md5').update(jsContent).digest('hex'); // No hyphens
        debugID = addHyphensToUuid(bundleID);
        sourceMap.debugId = debugID;
        mapContent = JSON.stringify(sourceMap);
        debugIdSource = 'generated';
        debugIdsGenerated++;
      }

      log.dim(`    debug id: ${debugID.substring(0, 8)} (${debugIdSource})`);

      // Inject the file->bundleID map snippet (skip if already injected):
      if (isAlreadyInjected(jsContent)) {
        log.dim(`    skipping injection - already processed`);
      } else {
        jsContent = injectBundleIDToSourceFile(jsContent, bundleID);
      }

      // write the updated source code back to the file
      if (!dryRun && replaceBundleID) {
        fs.writeFileSync(jsFilePath, jsContent, fileEncoding);
        fs.writeFileSync(mapFilePath, mapContent, fileEncoding);
      }

      // upload the files to the Embrace API
      if (dryRun) {
        log.info('Dry run, skipping upload');
      } else if (upload) {
        log.info('Uploading file to Embrace API');
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
        });
        log.success(`  ${relJs} [${debugID.slice(0, 8)}]`);
      }

      processed++;
    }

    // If the app version was provided, but it couldn't be replaced in any of the files, exit with error.
    if (appVersion && !appVersionFile) {
      log.error('Template app version not found in any files');
      process.exit(1);
    }

    // Summary
    log.dim('');
    if (appVersion && appVersionFile) {
      log.info(`App version: ${appVersion} (${appVersionFile})`);
    }
    if (debugIdsGenerated > 0) {
      log.info(
        `Debug IDs: ${debugIdsGenerated.toString()} generated (sourcemaps without debugId get one added)`,
      );
    }
    if (dryRun) {
      log.info(`Dry run complete: ${processed} files would be processed`);
    } else if (upload) {
      log.success(`Done: ${processed} files processed and uploaded`);
    } else {
      log.success(`Done: ${processed} files processed (upload disabled)`);
    }
  } catch (err) {
    log.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) {
      log.dim(err.stack);
    }
    process.exit(1);
  }
};
