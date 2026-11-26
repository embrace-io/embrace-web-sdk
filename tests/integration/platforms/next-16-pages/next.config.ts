import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  reactCompiler: true,
  reactStrictMode: true,
};

export default nextConfig;
