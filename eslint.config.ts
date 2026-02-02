import type { ESLint } from 'eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import baselinePlugin from 'eslint-plugin-baseline-js';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/*', '!src/', '!src/**/*']),
  {
    files: ['src/**/*.{js,ts,mjs,cjs}'],
    ignores: ['**/*.test.*', '**/testUtils/**'],
    languageOptions: {
      parser: tseslint.parser,
      // enables type-aware linting to detect instance method usage
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      'baseline-js': baselinePlugin as ESLint.Plugin,
    },
    rules: {
      'baseline-js/use-baseline': [
        'error',
        {
          available: 'widely',
          includeWebApis: { preset: 'type-aware' },
          includeJsBuiltins: { preset: 'type-aware' },
        },
      ],
    },
  },
]);
