import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
