import { defineConfig, type BuildEnvironmentOptions } from 'vite';
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
    },
    define: {
      'process.env.EMBRACE_DATA_URL': JSON.stringify(
        process.env.EMBRACE_DATA_URL
      ),
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
