import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import Sonda from 'sonda/rollup';
import pkg from './package.json' with { type: 'json' };

// Treat all deps as external for NPM build
const externalDeps = [
  'tslib',
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
];

const input = {
  index: 'src/index.ts',
  'react-instrumentation': 'src/react/index.ts',
};

export default defineConfig([
  // ESM Build
  {
    input,
    plugins: [
      Sonda({
        enabled: false,
        format: 'html',
        outputDir: 'node_modules/.sonda',
        open: true,
        deep: false,
        sources: false,
        gzip: true,
        brotli: false,
      }),
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
    input,
    plugins: [
      Sonda({
        enabled: false,
        format: 'html',
        outputDir: 'node_modules/.sonda',
        open: true,
        deep: false,
        sources: false,
        gzip: true,
        brotli: false,
      }),
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
    input,
    plugins: [
      Sonda({
        enabled: false,
        format: 'html',
        outputDir: 'node_modules/.sonda',
        open: true,
        deep: false,
        sources: false,
        gzip: true,
        brotli: false,
      }),
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

  // CDN Build, it only exports the core web sdk and not any additional instrumentation
  {
    input: 'src/index.ts',
    plugins: [
      Sonda({
        enabled: false,
        format: 'html',
        outputDir: 'node_modules/.sonda',
        open: true,
        deep: false,
        sources: false,
        gzip: true,
        brotli: false,
      }),
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
      sourcemap: true,
    },
  },
]);
