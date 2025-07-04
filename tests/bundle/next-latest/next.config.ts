import type { NextConfig } from 'next';
import Sonda from 'sonda/next';

const withJsonSondaAnalyzer = Sonda({
  format: 'json',
  open: false,
  gzip: true,
  outputDir: '.sonda',
});

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
};

export default withJsonSondaAnalyzer(nextConfig);
