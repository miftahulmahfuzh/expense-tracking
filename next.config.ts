import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Every route in this app runs on the Node.js runtime (the Next 16 default).
  // Nothing here opts into the Edge runtime — see docs/plans/F01-foundation.md §4.
  reactStrictMode: true,

  // Vercel Blob public URLs. F06 attaches photos from this host; declaring it here
  // (rather than in F06) keeps all host allow-listing in one place.
  //
  // F06 Task 3 narrowed what F01 opened. A pattern that names only a hostname implies
  // `pathname: '/**'` and `search: '**'` (Next 16 images docs, "Good to know"), which makes
  // /_next/image an open optimizing proxy for *every* blob in the store — including any
  // future non-photo prefix — for anyone who can get a URL into a page. Three tightenings:
  //
  //   *  vs **      — a store host is `<storeId>.public.blob.vercel-storage.com`, exactly one
  //                   label. `**` matches any number of leading labels, so it also matches a
  //                   host an attacker controls under a lookalike registrable domain.
  //   pathname      — lib/photos/pathname.ts writes only under `photos/` (decision D-F), and
  //                   the upload route rejects any other prefix, so this is the whole surface.
  //   search: ''    — no query string. Our blob URLs never carry one.
  //
  // Image Optimization allowance (Hobby, checked 2026-08-19): transformations are cached
  // ~31 days and keyed on (source, width, quality). One grid size × one DPR bucket ≈ 1–2
  // per photo per month, ~120/month at 60 photos/month — far inside the plan. The escape
  // hatch if that ever changes is `unoptimized` on PhotoGallery's <Image>
  // (docs/plans/F06-photos.md §13.4), not a wider pattern here.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
        port: '',
        pathname: '/photos/**',
        search: '',
      },
    ],
  },

  // No `eslint` key: `next build` no longer runs the linter in Next 16, and the option
  // was removed. Linting runs via `npm run lint` and in CI/pre-push only.
  // No `webpack` key: Turbopack is the default bundler in Next 16 and a webpack config
  // would make `next build` fail outright.
}

export default nextConfig
