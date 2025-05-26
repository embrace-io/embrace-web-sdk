import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default defineConfig([
  // ESM Build
  {
    input: 'src/index.ts',
    plugins: [
      resolve({
        browser: true,
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
  },

  // ESNext build
  {
    input: 'src/index.ts',
    plugins: [
      resolve({
        browser: true,
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
  },

  // CJS build
  {
    input: 'src/index.ts',
    plugins: [
      resolve({
        browser: true,
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
  },

  // CDN Build
  {
    input: 'build/esm/index.js',
    plugins: [
      commonjs(),
      resolve({
        browser: true,
      }),
    ],
    output: {
      file: 'build/iife/bundle.js',
      format: 'iife',
      name: 'EmbraceWebSdk',
    },
  },
]);
