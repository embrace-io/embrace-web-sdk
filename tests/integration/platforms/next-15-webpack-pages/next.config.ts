import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  reactStrictMode: true,
  serverExternalPackages: ['@opentelemetry/instrumentation'],
};

export default nextConfig;
