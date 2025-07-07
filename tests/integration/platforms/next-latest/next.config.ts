import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  env: {
    EMBRACE_DATA_URL: process.env.EMBRACE_DATA_URL,
  },
};

export default nextConfig;
