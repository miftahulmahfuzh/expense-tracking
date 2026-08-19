/**
 * F06 Task 9 — the pre-flight gate.
 *
 * `compressForUpload` itself needs a real canvas, a real decoder and a Web Worker, so it
 * is covered by the device QA table rather than here (this suite runs in node, and the
 * repo has exactly one Vitest config — R-11 — with no jsdom). `rejectionReason` is pure,
 * and it is the only thing standing between the queue and a 25 MB TIFF, so it is tested:
 * every branch is a user-visible Indonesian string named in the plan's desktop checks.
 */
import { describe, expect, it } from 'vitest'

import { rejectionReason } from '@/lib/photos/compress'
import { MAX_SOURCE_BYTES } from '@/lib/photos/constants'

/** Minimal stand-in: rejectionReason only ever reads name, type and size. */
const asFile = (name: string, type: string, size: number): File =>
  ({ name, type, size }) as unknown as File

describe('rejectionReason', () => {
  it('accepts an ordinary iPhone JPEG', () => {
    expect(rejectionReason(asFile('image.jpg', 'image/jpeg', 3_800_000))).toBeNull()
  })

  it('accepts a QRIS screenshot (PNG — we transcode it to JPEG later)', () => {
    expect(rejectionReason(asFile('IMG_2043.PNG', 'image/png', 2_100_000))).toBeNull()
  })

  it('accepts HEIC by MIME, and lets the decoder be the one to refuse it', () => {
    // Rejecting HEIC here would break the target device, where Safari decodes it fine.
    expect(rejectionReason(asFile('IMG_1234.HEIC', 'image/heic', 2_400_000))).toBeNull()
  })

  it('accepts HEIC by extension when the browser reported no type at all', () => {
    expect(rejectionReason(asFile('IMG_1234.heic', '', 2_400_000))).toBeNull()
  })

  it('rejects a non-image with its name in the message', () => {
    expect(rejectionReason(asFile('receipt.pdf', 'application/pdf', 90_000))).toBe(
      '"receipt.pdf" bukan file gambar.',
    )
  })

  it('rejects an empty file', () => {
    expect(rejectionReason(asFile('broken.jpg', 'image/jpeg', 0))).toBe('"broken.jpg" kosong.')
  })

  it('rejects an oversized source, quoting both sizes the way the plan specifies', () => {
    expect(rejectionReason(asFile('scan.tiff', 'image/tiff', 30 * 1024 * 1024))).toBe(
      'Terlalu besar (30 MB). Maksimum 25 MB.',
    )
  })

  it('is inclusive at exactly the cap, and rejects one byte over', () => {
    expect(rejectionReason(asFile('a.jpg', 'image/jpeg', MAX_SOURCE_BYTES))).toBeNull()
    expect(rejectionReason(asFile('a.jpg', 'image/jpeg', MAX_SOURCE_BYTES + 1))).not.toBeNull()
  })

  it('checks type before size, so a huge PDF is called a PDF and not "too big"', () => {
    expect(rejectionReason(asFile('huge.pdf', 'application/pdf', 40 * 1024 * 1024))).toContain(
      'bukan file gambar',
    )
  })
})
