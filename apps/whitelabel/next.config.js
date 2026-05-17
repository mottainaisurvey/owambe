/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Type checking is performed in the dedicated lint CI step.
    ignoreBuildErrors: true,
  },
  eslint: {
    // ESLint is run in the dedicated lint CI step.
    ignoreDuringBuilds: true,
  },

  // Allow any subdomain to be passed as a header
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
        ],
      },
    ];
  },

  // Rewrites so custom domains work — Vercel handles this at edge
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    };
  },

  images: {
    domains: [
      'owambe-media.s3.af-south-1.amazonaws.com',
      'owambe-media.s3.amazonaws.com',
      'images.unsplash.com',
      '*.owambe.com',
    ],
    formats: ['image/webp', 'image/avif'],
  },

  env: {
    OWAMBE_API_URL: process.env.OWAMBE_API_URL || 'https://api.owambe.com/api',
    OWAMBE_MAIN_URL: process.env.OWAMBE_MAIN_URL || 'https://owambe.com',
  },
};

module.exports = nextConfig;
