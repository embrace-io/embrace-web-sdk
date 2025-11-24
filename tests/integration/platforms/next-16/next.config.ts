import { join } from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,

  // Turbopack root configuration to resolve symlinked file: dependencies
  // https://github.com/vercel/next.js/issues/77562#issuecomment-2786578176
  outputFileTracingRoot: join(__dirname, '../../../..'),
  turbopack: {
    root: join(__dirname, '../../../..'),
  },
};

export default nextConfig;
