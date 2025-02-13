#!/usr/bin/env node
import { Command, Option } from 'commander';
import { processSourceFiles } from './processSourceFiles.js';
import {
  CLI_DESCRIPTION,
  CLI_NAME,
  CLI_VERSION,
  DEFAULT_FILE_ENCODING,
  SOURCE_MAP_UPLOAD_HOST,
  SOURCE_MAP_UPLOAD_PATH,
  TEMPLATE_BUNDLE_ID,
} from './constants.js';

// Use commander to parse command-line options
const program = new Command();

program.name(CLI_NAME).description(CLI_DESCRIPTION).version(CLI_VERSION);

program
  .command('upload')
  .description(CLI_DESCRIPTION)
  .addOption(
    new Option('-b, --bundle <bundle>', 'Path to the JS Bundled file')
      .env('EMB_JS_BUNDLE_PATH')
      .makeOptionMandatory()
  )
  .addOption(
    new Option('-m, --map <map>', 'Path to the source map file')
      .env('EMB_JS_SOURCE_MAP_PATH')
      .makeOptionMandatory()
  )
  .addOption(
    new Option('-t, --token <token>', 'API token to authenticate with Embrace')
      .env('EMB_SOURCE_UPLOAD_API_TOKEN')
      .makeOptionMandatory()
  )
  .addOption(
    new Option('-a, --app-id <appID>', 'Application ID')
      .env('EMB_APP_ID')
      .makeOptionMandatory()
  )
  .addOption(
    new Option(
      '-d, --dry-run',
      'Make a dry run without uploading or saving the replacements'
    ).env('EMB_DRY_RUN')
  )
  .addOption(
    new Option(
      '-e, --encoding [fileEncoding]',
      'File encoding for reading and writing the JS and map files'
    )
      .env('EMB_ENCODING')
      .choices([
        'ascii',
        'utf8',
        'utf-8',
        'utf16le',
        'utf-16le',
        'ucs2',
        'ucs-2',
        'base64',
        'base64url',
        'latin1',
        'binary',
        'hex',
      ])
      .default(DEFAULT_FILE_ENCODING)
  )
  .addOption(
    new Option('--host [host]', 'Embrace URL host to upload source maps to')
      .env('EMB_SOURCE_MAP_UPLOAD_HOST')
      .default(SOURCE_MAP_UPLOAD_HOST)
      .makeOptionMandatory()
      .hideHelp()
  )
  .addOption(
    new Option(
      '--path-for-upload [pathForUpload]',
      'Embrace URL path to upload source maps to'
    )
      .env('EMB_SOURCE_MAP_UPLOAD_PATH')
      .default(SOURCE_MAP_UPLOAD_PATH)
      .makeOptionMandatory()
      .hideHelp()
  )
  .addOption(
    new Option('--store-type [storeType]', 'Embrace store type for the upload')
      .env('EMB_STORE_TYPE')
      .default('sourcemap')
      .makeOptionMandatory()
      .hideHelp()
  )
  .addOption(
    new Option(
      '--template-bundle-id [templateBundleID]',
      'Embrace Template Bundle ID build into the SDK source code for replacement'
    )
      .env('EMB_TEMPLATE_BUNDLE_ID')
      .default(TEMPLATE_BUNDLE_ID)
      .makeOptionMandatory()
      .hideHelp()
  )
  .addOption(
    new Option('--cli-version [cliVersion]', 'Version of this CLI tool')
      .env('EMB_CLI_VERSION')
      .default(CLI_VERSION)
      .makeOptionMandatory()
      .hideHelp()
  )
  .action(async options => {
    const {
      bundle,
      map,
      token,
      appId,
      host,
      pathForUpload,
      storeType,
      templateBundleId,
      cliVersion,
      dryRun,
      encoding,
    } = options; // Destructure the options
    await processSourceFiles({
      jsFilePath: bundle,
      mapFilePath: map,
      token,
      appID: appId, // commander processes it as appId instead of appID, ergo the rename
      host,
      pathForUpload,
      storeType,
      templateBundleID: templateBundleId, // commander processes it as templateBundleId instead of templateBundleID, ergo the rename
      cliVersion,
      fileEncoding: encoding,
      dryRun,
    });
  });

program.parse(process.argv);
