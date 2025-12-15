import baselinePlugin from 'eslint-plugin-baseline-js';
import tseslint from 'typescript-eslint';

export default [
  {
    files: ['src/**/*.{js,ts}'],
    ignores: ['**/*.test.ts', '**/*.spec.ts', '**/testUtils/**'],
    languageOptions: {
      parser: tseslint.parser,
      // enables type-aware linting to detect instance method usage
      parserOptions: {
        projectService: true,
      },
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
