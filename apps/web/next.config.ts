
import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  transpilePackages: ['@eimax/shared-ui'],
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${process.env.API_ORIGIN ?? 'http://127.0.0.1:4000'}/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
