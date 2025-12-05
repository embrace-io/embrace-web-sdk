import createConfig from './vite.config.base.ts';

export default createConfig({
  target: 'esnext',
  outDir: 'dist/esnext',
  sondaOutput: '.sonda/esnext',
});
