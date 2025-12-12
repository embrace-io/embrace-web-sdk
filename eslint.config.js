import baselinePlugin from 'eslint-plugin-baseline-js';
import tseslint from 'typescript-eslint';

export default [
  {
    files: ['src/**/*.{js,ts}'],
    ignores: ['**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      'baseline-js': baselinePlugin,
    },
    rules: {
      ...baselinePlugin.configs['recommended-ts']({
        available: 'widely',
        level: 'error',
      }).rules,
    },
  },
];
