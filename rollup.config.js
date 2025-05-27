import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import pkg from './package.json' with { type: 'json' };

// Treat all deps as external for NPM build
const externalDeps = [
  'tslib',
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
];

export default defineConfig([
  // ESM Build
  {
    input: 'src/index.ts',
    plugins: [
      typescript({
        tsconfig: './tsconfig.esm.json',
      }),
      terser(),
    ],
    output: {
      dir: 'build/esm',
      format: 'esm',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
    },
    external: externalDeps,
  },

  // ESNext build
  {
    input: 'src/index.ts',
    plugins: [
      typescript({
        tsconfig: './tsconfig.esnext.json',
      }),
      terser(),
    ],
    output: {
      dir: 'build/esnext',
      format: 'esm',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
    },
    external: externalDeps,
  },

  // CJS build
  {
    input: 'src/index.ts',
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
      }),
      terser(),
    ],
    output: {
      dir: 'build/src',
      format: 'cjs',
      sourcemap: true,
    },
    external: externalDeps,
  },

  // CDN Build
  {
    input: 'src/index.ts',
    plugins: [
      typescript({
        tsconfig: './tsconfig.esm.json',
      }),
      commonjs(),
      resolve({
        browser: true,
      }),
      terser(),
    ],
    output: {
      file: 'build/iife/bundle.js',
      format: 'iife',
      name: 'EmbraceWebSdk',
    },
  },
]);
