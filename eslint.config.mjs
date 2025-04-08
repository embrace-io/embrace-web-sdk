import { FlatCompat } from '@eslint/eslintrc';
import pluginJs from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import cliPackageInfo from './cli/package.json' with { type: 'json' };
import sdkPackageInfo from './package.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** @type {import('eslint').Linter.Config[]} */
export default tseslint.config({
  files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
  extends: [
    pluginJs.configs.recommended,
    tseslint.configs.strictTypeChecked,
    eslintConfigPrettier,
    ...compat.extends('plugin:require-extensions/recommended'),
    ...compat.plugins('prefer-arrow-functions'),
    ...compat.plugins('regex'),
    ...compat.plugins('require-extensions'),
  ],
  rules: {
    'object-shorthand': ['error', 'always'],
    'class-methods-use-this': 'off',
    '@typescript-eslint/class-methods-use-this': [
      'error',
      {
        ignoreClassesThatImplementAnInterface: 'public-fields',
        ignoreOverrideMethods: true,
      },
    ],
    '@typescript-eslint/prefer-readonly': 'error',
    '@typescript-eslint/unbound-method': 'error',
    '@typescript-eslint/explicit-member-accessibility': 'error',
    '@typescript-eslint/no-invalid-void-type': [
      'error',
      {
        allowAsThisParameter: true,
      },
    ],
    'default-param-last': 'off',
    '@typescript-eslint/default-param-last': 'error',
    '@typescript-eslint/method-signature-style': 'error',
    '@typescript-eslint/consistent-type-exports': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: ['memberLike'],
        modifiers: ['private'],
        format: ['camelCase'],
        leadingUnderscore: 'require',
      },
    ],
    '@typescript-eslint/no-inferrable-types': [
      'error',
      { ignoreProperties: true },
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        args: 'all',
        argsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
    'no-restricted-syntax': ['error', 'ExportAllDeclaration'],
    'prefer-arrow-functions/prefer-arrow-functions': [
      'error',
      {
        returnStyle: 'implicit',
      },
    ],
    'func-style': 'error',
    'regex/invalid': [
      'error',
      [
        {
          regex: `SDK_VERSION = '(?!${sdkPackageInfo.version}).*'`,
          message: `SDK_VERSION version mismatch. It should match the package.json version ${sdkPackageInfo.version}.`,
          replacement: `SDK_VERSION = '${sdkPackageInfo.version}'`,
        },
        {
          regex: `CLI_VERSION = '(?!${cliPackageInfo.version}).*'`,
          message: `CLI_VERSION version mismatch. It should always match the one listed in both package.json (${sdkPackageInfo.version}) and cli/package.json (${cliPackageInfo.version}) and those 2 should be in sync.`,
          replacement: `CLI_VERSION = '${cliPackageInfo.version}'`,
        },
        // we validate the version in the cli version against the sdk version, to make sure both the sdk and cli versions are in sync
        {
          regex: `CLI_VERSION = '(?!${sdkPackageInfo.version}).*'`,
          message: `CLI_VERSION version mismatch. It should always match the one listed in both package.json (${sdkPackageInfo.version}) and cli/package.json (${cliPackageInfo.version}) and those 2 should be in sync.`,
        },
      ],
    ],
  },
  languageOptions: {
    globals: globals.browser,
    parserOptions: {
      project: ['./tsconfig.test.json', './cli/tsconfig.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
