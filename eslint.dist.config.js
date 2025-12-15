import baselinePlugin from 'eslint-plugin-baseline-js';

// Compiled output - catches non-baseline APIs from dependencies
export default [
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
          // compression-streams: widely available since Nov 2025, plugin data stale
          // proto: deprecated but universally supported, used by bundled dependencies
          ignoreFeatures: ['compression-streams', 'proto'],
        },
      ],
    },
  },
];
