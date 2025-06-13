import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import pkg from './package.json' with { type: 'json' };
import swc from '@rollup/plugin-swc';
import Sonda from 'sonda/rollup';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

const showSummary = process.env.SHOW_SUMMARY === '1';

// Treat all deps as external for NPM build
const allDeps = [
  ...Object.keys(pkg.dependencies),
  ...Object.keys(pkg.peerDependencies),
];
const externalDeps = id =>
  allDeps.some(
    dep =>
      id === dep || id.startsWith(`${dep}/`) || id.startsWith('@opentelemetry/')
  );

console.info(
  `Building Embrace Web SDK with the following external dependencies: ${JSON.stringify(allDeps)}`
);

const input = {
  index: 'src/index.ts',
  'react-instrumentation': 'src/react/index.ts',
};

const plugins = (target = 'es2022') => [
  Sonda({
    enabled: showSummary,
    format: 'html',
    outputDir: 'node_modules/.sonda',
    open: true,
    deep: false,
    sources: false,
    gzip: false,
    brotli: false,
  }),
  // typescript({
  //   // rollup does not support tsconfig.json with "extends"
  //   tsconfig: './tsconfig.base.json',
  // }),
  nodeResolve({
    browser: true,
    extensions: ['.js', '.ts', '.jsx', '.tsx'],
  }),
  commonjs(),
  swc({
    swc: {
      sourceMaps: true,
      // minify: true,
      jsc: {
        target,
        // minify: {
        //   compress: true,
        //   mangle: true,
        // },
      },
    },
  }),
  terser(),
];

const onwarn = (warning, warn) => {
  if (
    [
      'CIRCULAR_DEPENDENCY',
      'CYCLIC_CROSS_CHUNK_REEXPORT',
      'THIS_IS_UNDEFINED',
    ].includes(warning.code)
  ) {
    return;
  }

  warn(warning);
};

const cjsConfig = {
  input,
  output: {
    dir: 'build/cjs',
    format: 'cjs',
    preserveModules: true,
    sourcemap: true,
  },
  plugins: plugins(),
  external: externalDeps,
  onwarn,
};

const esmConfig = {
  input,
  output: {
    dir: 'build/esm',
    format: 'esm',
    preserveModules: true,
    sourcemap: true,
  },
  plugins: plugins(),
  external: externalDeps,
  onwarn,
};

const esnextConfig = {
  input,
  output: {
    dir: 'build/esnext',
    format: 'esm',
    preserveModules: true,
    sourcemap: true,
  },
  plugins: plugins('esnext'),
  external: externalDeps,
  onwarn,
};

const cdnConfig = {
  input: input.index,
  output: {
    file: 'build/iife/index.js',
    format: 'iife',
    name: 'EmbraceWebSdk',
    sourcemap: true,
  },
  plugins: plugins(),
  onwarn,
};

const config = [cjsConfig, esmConfig, esnextConfig, cdnConfig];

export default config;
