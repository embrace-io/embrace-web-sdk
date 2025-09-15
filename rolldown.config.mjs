import swc from '@rollup/plugin-swc';
import terser from '@rollup/plugin-terser';
import { defineConfig } from 'rolldown';
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

const plugins = ({ target }) => [
  Sonda({
    enabled: false, // Disable Sonda instrumentation for now
    open: true, // Open Sonda report in browser
    gzip: true, // Show gzip compression estimate
    sources: false, // Include source files in Sonda report - useful for debugging but can be unsafe in private repos
  }),
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
  },

  // CDN Build: IIFE bundle for direct browser usage
  {
    input: 'src/index.ts',
    plugins: [...plugins({ target: 'es6' }), terser()], // Minify for smaller bundle size
    output: {
      file: 'build/iife/bundle.js',
      format: 'iife',
      // global variable name for the SDK
      name: 'EmbraceWebSdk',
      sourcemap: true,
      // TODO create a new entry file that sets the window variable explicitly and remove this line.
      // This is a workaround to assign the SDK to the global window object so users can lazyload the SDK.
      // By default, rollup creates the export with 'var' and assumes the SDK is being used in a script tag,
      // which would normally be the window.
      footer: 'window.EmbraceWebSdk = EmbraceWebSdk;',
    },
    external: peerDeps,
  },
]);
