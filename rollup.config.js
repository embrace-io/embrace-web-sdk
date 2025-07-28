import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import swc from '@rollup/plugin-swc';
import terser from '@rollup/plugin-terser';
import { defineConfig } from 'rollup';
import Sonda from 'sonda/rollup';
import pkg from './package.json' with { type: 'json' };

const deps = Object.keys(pkg.dependencies || {});
const peerDeps = Object.keys(pkg.peerDependencies || {});

// Determine external dependencies to exclude from the bundle
const isExternal = id =>
  peerDeps.includes(id) ||
  deps.includes(id) ||
  // Include dependencies that reference subdirectories
  deps.some(dep => id.startsWith(dep + '/'));

const input = {
  index: 'src/index.ts',
  'react-instrumentation': 'src/react-instrumentation/index.ts',
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

// Configure plugins based on the target build environment
const plugins = ({ target }) => [
  Sonda({
    enabled: false, // Disable Sonda instrumentation for now
    open: false, // Open Sonda report in browser
    gzip: true, // Show gzip compression estimate
    sources: false, // Include source files in Sonda report - useful for debugging but can be unsafe in private repos
  }),
  resolve({
    mainFields: ['esnext', 'browser', 'module', 'main'], // Resolve priority for entry points, prefer esnext
    extensions: ['.js', '.ts', '.jsx', '.tsx'], // Required because we import .ts files with .js extension
  }),
  commonjs(), // Convert CommonJS modules to ES modules
  swc({
    swc: {
      sourceMaps: true, // Generate source maps
      jsc: {
        target, // Set JavaScript output version
      },
    },
  }),
];

export default defineConfig([
  // ESM Build: Modern JavaScript modules for browsers and bundlers
  {
    input,
    plugins: plugins({ target: 'es2022' }),
    output: {
      dir: 'build/esm',
      format: 'esm',
      sourcemap: true,
      preserveModules: true, // Keep module structure intact
      preserveModulesRoot: 'src',
    },
    external: isExternal,
    onwarn,
  },

  // CJS Build: CommonJS modules for Next.js and webpack < 5
  {
    input,
    plugins: plugins({ target: 'es2022' }),
    output: {
      dir: 'build/cjs',
      format: 'cjs',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src',
      entryFileNames: '[name].cjs',
      chunkFileNames: '[name]-[hash].cjs',
    },
    external: isExternal,
    onwarn,
  },

  // CDN Build: IIFE bundle for direct browser usage
  {
    input: 'src/iife.ts',
    plugins: [...plugins({ target: 'es6' }), terser()], // Minify for smaller bundle size
    output: {
      file: 'build/iife/bundle.js',
      format: 'iife',
      sourcemap: true,
    },
    external: peerDeps,
    onwarn,
  },
]);
