import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginReact from 'eslint-plugin-react';
import prettierPlugin from 'eslint-plugin-prettier/recommended';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import path from 'node:path';

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
    tseslint.configs.stylisticTypeChecked,
    pluginReact.configs.flat.recommended,
    pluginReact.configs.flat['jsx-runtime'],
    prettierPlugin,
    ...compat.extends('plugin:require-extensions/recommended'),
    ...compat.plugins('prefer-arrow-functions'),
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
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'memberLike',
        modifiers: ['private', 'protected'],
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
      { argsIgnorePattern: '^_', args: 'after-used' },
    ],
    'no-restricted-syntax': ['error', 'ExportAllDeclaration'],
    'prefer-arrow-functions/prefer-arrow-functions': [
      'error',
      {
        returnStyle: 'implicit',
      },
    ],
    'func-style': 'error',
  },
  languageOptions: {
    globals: globals.browser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
