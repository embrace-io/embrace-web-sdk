import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  outputFileTracingRoot: __dirname,

  // NOTE: saving for later when we upgrade to Next.js 16
  // Turbopack root configuration to resolve symlinked file: dependencies
  // https://github.com/vercel/next.js/issues/77562#issuecomment-2786578176
  // outputFileTracingRoot: join(__dirname, '../../../..'),
  // turbopack: {
  //   root: join(__dirname, '../../../..'),
  // },
};

export default nextConfig;
