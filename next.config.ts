import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Every route in this app runs on the Node.js runtime (the Next 16 default).
  // Nothing here opts into the Edge runtime — see docs/plans/F01-foundation.md §4.
  reactStrictMode: true,

  // Vercel Blob public URLs. F06 attaches photos from this host; declaring it here
  // (rather than in F06) keeps all host allow-listing in one place.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
      },
    ],
  },

  // No `eslint` key: `next build` no longer runs the linter in Next 16, and the option
  // was removed. Linting runs via `npm run lint` and in CI/pre-push only.
  // No `webpack` key: Turbopack is the default bundler in Next 16 and a webpack config
  // would make `next build` fail outright.
}

export default nextConfig
