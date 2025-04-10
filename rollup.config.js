import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'build/esm/index.js',
  plugins: [
    commonjs(),
    resolve({
      browser: true,
    }),
  ],
  output: {
    file: 'build/esm/bundle.js',
    format: 'iife',
    name: 'EmbraceWebSdk',
  },
};
