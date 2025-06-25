import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import swc from '@rollup/plugin-swc';
import terser from '@rollup/plugin-terser';
import { defineConfig } from 'rollup';
import Sonda from 'sonda/rollup';
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

const plugins = ({ target }) => [
  Sonda({
    enabled: false,
    gzip: true,
    sources: true,
  }),
  resolve({
    mainFields: ['esnext', 'browser', 'module', 'main'],
    extensions: ['.js', '.ts', '.jsx', '.tsx'],
  }),
  commonjs(),
  swc({
    swc: {
      sourceMaps: true,
      jsc: {
        target,
      },
    },
  }),
];

export default defineConfig([
  // ESM Build
  {
    input,
    plugins: plugins({ target: 'es2022' }),
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
    plugins: plugins({ target: 'esnext' }),
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
    plugins: plugins({ target: 'es2022' }),
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
    plugins: [...plugins({ target: 'es6' }), terser()],
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
