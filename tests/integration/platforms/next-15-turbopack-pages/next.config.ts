import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  reactStrictMode: true,
  serverExternalPackages: ['@opentelemetry/instrumentation'],
  experimental: {
    // Adds OS Native trust certificates.
    // Required for next to download fonts from Google.
    // @ts-expect-error
    turbopackUseSystemTlsCerts: true,
  },
};

export default nextConfig;
