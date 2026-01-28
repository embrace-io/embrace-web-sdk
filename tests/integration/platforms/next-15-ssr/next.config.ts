import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  outputFileTracingRoot: __dirname,
  // Avoid webpack warning from dynamic require.resolve() in the Node platform path
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
  serverExternalPackages: ['@opentelemetry/instrumentation'],
};

export default nextConfig;
