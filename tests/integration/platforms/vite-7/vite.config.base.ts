import { defineConfig } from 'vite';
import type { BuildEnvironmentOptions } from 'vite';
import react from '@vitejs/plugin-react';
import Sonda from 'sonda/vite';

type CreateConfigArgs = {
  target: BuildEnvironmentOptions['target'];
  outDir: string;
  sondaOutput: string;
};

// https://vite.dev/config/
export default ({ target, outDir, sondaOutput }: CreateConfigArgs) =>
  defineConfig({
    base: '',
    build: {
      sourcemap: true,
      target,
      outDir,
      rollupOptions: {
        output: {
          sourcemapDebugIds: true,
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@opentelemetry')) {
                return 'opentelemetry';
              }
              if (id.includes('react')) {
                return 'react';
              }
              if (id.includes('protobufjs')) {
                return 'protobufjs';
              }

              // All other node_modules go into 'vendor'
              return 'vendor';
            }
            return null;
          },
        },
      },
    },
    plugins: [
      react({
        include: '**/*.tsx',
      }),
      Sonda({
        format: 'json',
        open: false,
        gzip: true,
        outputDir: sondaOutput,
      }),
      Sonda({
        format: 'html',
        open: false,
        gzip: true,
        outputDir: sondaOutput,
      }),
    ],
  });
