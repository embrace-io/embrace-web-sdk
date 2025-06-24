import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import pkg from './package.json' with { type: 'json' };

const peerDeps = Object.keys(pkg.peerDependencies || {});

const input = {
  index: 'src/index.ts',
  'react-instrumentation': 'src/react/index.ts',
};

export default defineConfig([
  // ESM Build
  {
    input,
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        target: 'es2017',
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
  },

  // ESNext build
  {
    input,
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
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
  },

  // CJS build
  {
    input,
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        target: 'es2017',
      }),
      terser(),
    ],
    output: {
      dir: 'build/src',
      format: 'cjs',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
    },
  },

  // CDN Build, it only exports the core web sdk and not any additional instrumentation
  {
    input: 'src/index.ts',
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        target: 'es6',
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
    external: peerDeps,
  },
]);
