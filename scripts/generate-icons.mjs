/**
 * Rasterises public/brand/mark.svg into every size the platforms actually read.
 *
 * Run after any change to the mark: `node scripts/generate-icons.mjs`
 *
 * Why each one exists:
 *   app/apple-icon.png            180  iOS home screen. THE ONE THAT MATTERS MOST — iOS
 *                                      ignores the manifest icons for the home screen.
 *   app/icon.png                   32  browser tab favicon; Next emits the link tag itself.
 *   public/icons/icon-192.png     192  Android/Chrome install prompt minimum.
 *   public/icons/icon-512.png     512  Chrome install dialog and splash generation.
 *   public/icons/icon-maskable... 512  purpose: "maskable" — Android adaptive-icon masking.
 *   public/og-default.png    1200x630  the Open Graph card every /s/[token] link shares
 *                                      (F09 §2.7 — one static image, never a per-link one,
 *                                      because Meta caches a scraped card past a revoke).
 *                                      Sourced from public/brand/og.svg, not mark.svg: the
 *                                      card is 1.91:1, and a square mark letterboxed into it
 *                                      would be a tenth of the frame.
 */
import sharp from 'sharp'

const SRC = 'public/brand/mark.svg'

const JOBS = [
  ['app/apple-icon.png', 180],
  ['app/icon.png', 32],
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/icon-maskable-512.png', 512],
]

// density 600 so the 1024pt viewBox rasterises well above every target size before downscaling
await Promise.all(
  JOBS.map(([out, size]) => sharp(SRC, { density: 600 }).resize(size, size).png().toFile(out)),
)

// The OG card is its own 1200x630 artwork, so it is a separate source and a separate resize.
const OG_OUT = 'public/og-default.png'
await sharp('public/brand/og.svg', { density: 300 }).resize(1200, 630).png().toFile(OG_OUT)

console.log(`icons written: ${[...JOBS.map(([out]) => out), OG_OUT].join(', ')}`)
