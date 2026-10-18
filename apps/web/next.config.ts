import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript sources, so Next compiles them.
  transpilePackages: ['@app/config', '@app/contracts', '@app/ui'],
};

export default nextConfig;
