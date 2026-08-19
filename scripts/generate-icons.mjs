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

console.log(`icons written: ${JOBS.map(([out]) => out).join(', ')}`)
