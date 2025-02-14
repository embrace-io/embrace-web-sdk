import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
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
export default [
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  { files: ['**/*.ts'] },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  prettierPlugin,
  ...compat.plugins('require-extensions'),
  ...compat.extends('plugin:require-extensions/recommended'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          caughtErrors: 'none',
        },
      ],
    },
  },
];
