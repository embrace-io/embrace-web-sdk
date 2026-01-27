import type { ESLint } from 'eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import baselinePlugin from 'eslint-plugin-baseline-js';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/*', '!dist/', '!dist/**/*']),
  {
    files: ['dist/**/*.{js,ts,mjs,cjs}'],
    ignores: ['dist/**/*.d.{js,ts,mjs,cjs}'],
    languageOptions: {
      parser: tseslint.parser,
      // enables type-aware linting to detect instance method usage
      parserOptions: {
        project: './tsconfig.dist.json',
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
          ignoreFeatures: [
            // compression-streams: widely available since Nov 2025, plugin data stale
            'compression-streams',
            // proto: deprecated but universally supported, used by bundled dependencies
            'proto',
          ],
        },
      ],
    },
  },
]);
