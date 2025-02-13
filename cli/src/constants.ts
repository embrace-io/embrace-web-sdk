import packageInfo from '../package.json';

export const CLI_VERSION = packageInfo.version;
if (!CLI_VERSION) {
  throw new Error('unable to determine the current CLI version');
}

export const CLI_NAME = packageInfo.name;
if (!CLI_NAME) {
  throw new Error('unable to determine the CLI name');
}

export const CLI_DESCRIPTION = packageInfo.description;
if (!CLI_DESCRIPTION) {
  throw new Error('unable to determine the CLI description');
}

export const DEFAULT_FILE_ENCODING = 'utf8';
export const SOURCE_MAP_UPLOAD_HOST = 'https://dsym-store.emb-api.com';
export const SOURCE_MAP_UPLOAD_PATH = '/v2/store/';
export const TEMPLATE_BUNDLE_ID = 'EmbIOBundleIDfd6996f1007b363f87a';
