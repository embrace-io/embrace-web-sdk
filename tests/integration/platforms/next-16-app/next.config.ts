import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  reactCompiler: true,
  serverExternalPackages: ['@opentelemetry/instrumentation'],
};

export default nextConfig;
