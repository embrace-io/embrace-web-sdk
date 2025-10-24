import Sonda from 'sonda/vite';
import type { BuildEnvironmentOptions } from 'vite';
import { defineConfig } from 'vite';

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
    plugins: [
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
