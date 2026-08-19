'use client'

import imageCompression from 'browser-image-compression'

import {
  COMPRESSION_LIB_URL,
  COMPRESSION_MAX_ITERATION,
  MAX_SOURCE_BYTES,
  MAX_UPLOAD_BYTES,
  TARGET_MAX_EDGE,
  TARGET_MAX_MB,
  TARGET_QUALITY,
  UPLOAD_CONTENT_TYPE,
} from './constants'
import { formatBytes } from './format'

/**
 * Client-side compression — docs/plans/F06-photos.md Task 9.
 *
 * This is where roadmap D2 is enforced (≤1600px long edge, ~300 KB, JPEG q0.8) and where
 * the privacy gate lives (§12): every EXIF block, GPS coordinates included, is dropped.
 * Nothing downstream re-checks the pixels, so a bug here ships a 4 MB geotagged original
 * to a public CDN URL.
 */

export type CompressedImage = {
  file: File
  width: number
  height: number
  originalBytes: number
  compressedBytes: number
}

/**
 * MIME or extension. Both are needed: iOS reports `image/heic` for a Files-app pick, but
 * a file that arrived over a channel that stripped the type has only its name left.
 */
const HEIC_RE = /^image\/(heic|heif)$|\.(heic|heif)$/i

const HEIC_MESSAGE =
  'Foto HEIC tidak bisa dibaca browser ini. Coba pilih dari Photo Library, ' +
  'atau ubah Settings → Camera → Formats → Most Compatible.'

const UNREADABLE_MESSAGE = 'Gambar tidak bisa dibaca di browser ini.'

/**
 * Cheap pre-flight, before a tile is even created. Returns a human message when the file
 * should never be queued, or null to accept it.
 *
 * Deliberately generous about what counts as an image: `accept="image/*"` on the input is
 * a hint, not a guarantee, and a HEIC from the Files app may arrive with an empty
 * `file.type`. Anything that looks plausible gets as far as the decoder, which is the only
 * thing that can really tell.
 */
export function rejectionReason(file: File): string | null {
  const looksLikeImage = file.type.startsWith('image/') || HEIC_RE.test(file.name)
  if (!looksLikeImage) {
    return `"${file.name}" bukan file gambar.`
  }
  if (file.size === 0) {
    return `"${file.name}" kosong.`
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return `Terlalu besar (${formatBytes(file.size)}). Maksimum ${formatBytes(MAX_SOURCE_BYTES)}.`
  }
  return null
}

/**
 * Compress one picked file into something we are happy to store forever.
 *
 * Contract:
 *  - long edge ≤ TARGET_MAX_EDGE (1600)
 *  - size ≲ TARGET_MAX_MB (0.3 MB), best effort; hard-failed above MAX_UPLOAD_BYTES
 *  - always image/jpeg, quality starting at TARGET_QUALITY (0.8)
 *  - EXIF orientation baked into the pixels, so a portrait photo stays portrait
 *  - ALL EXIF removed, GPS included (§12)
 *  - runs in a Web Worker, so a 12 MP decode does not jank the review screen
 */
export async function compressForUpload(
  file: File,
  opts: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {},
): Promise<CompressedImage> {
  const isHeic = HEIC_RE.test(file.type) || HEIC_RE.test(file.name)
  const failure = isHeic ? HEIC_MESSAGE : UNREADABLE_MESSAGE

  let out: File
  try {
    out = await imageCompression(file, {
      maxSizeMB: TARGET_MAX_MB,
      maxWidthOrHeight: TARGET_MAX_EDGE,
      initialQuality: TARGET_QUALITY,
      maxIteration: COMPRESSION_MAX_ITERATION,
      fileType: UPLOAD_CONTENT_TYPE,

      // Off the main thread. Needs OffscreenCanvas, which Safari has had since 16.4 and
      // an XS Max runs iOS 18. Where it is missing the library falls back to the main
      // thread by itself: ~1.5 s of jank per photo, degraded rather than broken (OQ-7).
      useWebWorker: true,
      // Self-hosted (Task 4). The library's default for this is a jsDelivr CDN URL.
      libURL: COMPRESSION_LIB_URL,

      // ─── THE PRIVACY LINE ────────────────────────────────────────────────────────
      // `false` is also the library default, but it is stated explicitly because these
      // photos are rendered on an unauthenticated /s/[token] page. false => the output is
      // re-encoded from a canvas and has no EXIF block at all: no GPSLatitude, no
      // GPSLongitude, no DateTimeOriginal, no device model or serial. Without it,
      // forwarding a share link hands the recipient the coordinates of the user's home
      // for every photo taken there.
      preserveExif: false,

      // NOTE: exifOrientation is intentionally NOT passed. The library reads the source
      // orientation itself and bakes the rotation into the canvas; passing it as well
      // double-rotates. R-29 makes QA step 4 a hard gate on this, and §6 "If orientation
      // is wrong" holds the patch to apply if a real portrait photo comes out sideways.

      signal: opts.signal,
      onProgress: opts.onProgress,
    })
  } catch (error) {
    // Cancellation is not a failure — let the caller see the abort and mark the tile
    // 'canceled' rather than showing the user an error they caused on purpose.
    if (opts.signal?.aborted) throw error
    throw new Error(isHeic ? HEIC_MESSAGE : 'Gagal memproses gambar ini.')
  }

  // A browser that cannot decode the source — HEIC anywhere but Safari — produces a blank
  // or near-empty canvas instead of throwing. Two independent checks catch that: an
  // implausibly small encode, and a bitmap that will not decode to non-zero dimensions.
  if (out.size < 1024) {
    throw new Error(failure)
  }

  const { width, height } = await readDimensions(out)
  if (!width || !height) {
    throw new Error(failure)
  }

  // Best-effort compression can bottom out above target on a dense screenshot. Refusing
  // here — client-side, before any bytes move — gives a readable message instead of the
  // opaque 400 the upload route's maximumSizeInBytes would produce.
  if (out.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Masih ${formatBytes(out.size)} setelah dikompres — terlalu besar untuk diunggah.`,
    )
  }

  return {
    file: out,
    width,
    height,
    originalBytes: file.size,
    compressedBytes: out.size,
  }
}

/**
 * Decode the compressed output once to record its real pixel dimensions.
 *
 * They are worth the extra decode: `expense_photos.width/height` let the lightbox reserve
 * the right box before the image arrives, and they are the only evidence available later
 * that orientation was handled correctly (a portrait source must come out taller than
 * wide). Returns zeros rather than throwing — the caller turns that into the same
 * "cannot be read" message as an empty encode.
 */
async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode failed'))
      el.src = url
    })
    return { width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return { width: 0, height: 0 }
  } finally {
    URL.revokeObjectURL(url)
  }
}
