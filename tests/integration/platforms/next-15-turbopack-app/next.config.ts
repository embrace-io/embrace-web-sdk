import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  serverExternalPackages: ['@opentelemetry/instrumentation'],
};

export default nextConfig;
