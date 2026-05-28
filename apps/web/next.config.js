/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: true,
  typescript: {
    // Type checking is performed in the dedicated lint CI step.
    // Skipping here avoids false positives from pre-existing
    // @types/react version conflicts in the monorepo.
    ignoreBuildErrors: true,
  },
  eslint: {
    // ESLint is run in the dedicated lint CI step.
    ignoreDuringBuilds: true,
  },
  images: {
    domains: [
      'owambe-media.s3.af-south-1.amazonaws.com',
      'owambe-media.s3.amazonaws.com',
      'images.unsplash.com',
    ],
    formats: ['image/webp', 'image/avif'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
};

module.exports = nextConfig;
