import baselinePlugin from 'eslint-plugin-baseline-js';
import baseConfig from './eslint.config.js';

// Extends base config and adds compiled output checking
export default [
  ...baseConfig,
  // Compiled output - catches non-baseline APIs from dependencies
  {
    files: ['dist/**/*.js', 'dist/**/*.cjs'],
    ignores: ['dist/**/*.d.ts', 'dist/**/*.d.cts'],
    plugins: {
      'baseline-js': baselinePlugin,
    },
    rules: {
      'baseline-js/use-baseline': [
        'error',
        {
          available: 'widely',
          // compression-streams: widely available since May 2023, plugin data stale
          // proto: deprecated but universally supported, used by bundled dependencies
          ignoreFeatures: ['compression-streams', 'proto'],
        },
      ],
    },
  },
];
