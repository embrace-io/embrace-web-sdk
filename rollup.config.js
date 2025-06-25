import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import pkg from './package.json' with { type: 'json' };

const deps = Object.keys(pkg.dependencies || {});
const peerDeps = Object.keys(pkg.peerDependencies || {});

const isExternal = id =>
  peerDeps.includes(id) ||
  deps.includes(id) ||
  deps.some(dep => id.startsWith(dep + '/'));

const input = {
  index: 'src/index.ts',
  'react-instrumentation': 'src/react/index.ts',
};

// Suppress irrelevant warnings to keep the build output clean
const onwarn = (warning, warn) => {
  const ignoredWarnings = [
    'CIRCULAR_DEPENDENCY', // Circular dependencies are bundled, so no issue
    'CYCLIC_CROSS_CHUNK_REEXPORT', // Barrel exports are intentional
    'THIS_IS_UNDEFINED', // 'this' conversion to 'undefined' is preferred
    'SOURCEMAP_ERROR', // Some node_modules have invalid sourcemaps
  ];

  if (ignoredWarnings.includes(warning.code)) {
    return;
  }

  warn(warning);
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
    external: isExternal,
    onwarn,
  },

  // ESNext build
  {
    input,
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        target: 'esnext',
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
    external: isExternal,
    onwarn,
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
    external: isExternal,
    onwarn,
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
        mainFields: ['esnext', 'module', 'browser', 'main'],
        extensions: ['.js', '.ts', '.jsx', '.tsx'],
        preferBuiltins: false,
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
    onwarn,
  },
]);
