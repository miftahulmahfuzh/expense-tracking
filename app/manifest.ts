import type { MetadataRoute } from 'next'

/**
 * Served at `/manifest.webmanifest`, which is the path `metadata.manifest` in the root
 * layout points at. This plus the `appleWebApp` metadata is what turns "Add to Home Screen"
 * from a bookmark that opens in Safari — URL bar, tab strip and share bar eating ~140px of
 * an 896px screen — into something that opens full-screen with its own icon.
 *
 * The manifest takes a SINGLE theme_color, so it stays on the light value. Only the
 * `<meta name="theme-color" media="...">` pair from the layout's `viewport` export can vary
 * by scheme, and that pair is what Safari actually reads for the status-bar tint.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Expense Tracking',
    // ≤12 characters or iOS truncates it under the icon.
    short_name: 'Expenses',
    description: 'Catat pengeluaran dengan sekali tempel.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'id',
    dir: 'ltr',
    background_color: '#f0ede4',
    theme_color: '#f0ede4',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
