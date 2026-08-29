/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F06 — the per-group photo cap is CONFIGURATION, not a constant.
 *
 *  `PHOTO_MAX_PER_GROUP` exists so the cap can change without a commit. That only
 *  holds if three things are true, and each is a silent failure if it regresses:
 *
 *   1. Unset means the documented default. Adding this variable must not break a
 *      deployment that has never heard of it.
 *   2. A set value is actually what gets enforced — otherwise the knob is decorative.
 *   3. A bad value fails at BOOT, loudly. The failure mode of a too-large cap is a
 *      storage bill, and the failure mode of a zero is an upload button nobody can
 *      use; both are far cheaper to hit here than in front of a user.
 *
 *  The bound in lib/schema/expense.ts gets its own assertion at the bottom, because
 *  it is the one that can make this whole feature stop working *above 20* while every
 *  test about the cap itself still passes.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const REAL = process.env.PHOTO_MAX_PER_GROUP

function reset() {
  vi.resetModules()
}

beforeEach(reset)

afterEach(() => {
  if (REAL === undefined) delete process.env.PHOTO_MAX_PER_GROUP
  else process.env.PHOTO_MAX_PER_GROUP = REAL
  reset()
})

async function capWith(value: string | undefined) {
  if (value === undefined) delete process.env.PHOTO_MAX_PER_GROUP
  else process.env.PHOTO_MAX_PER_GROUP = value
  const { maxPhotosPerGroup } = await import('@/lib/photos/cap')
  return maxPhotosPerGroup()
}

describe('PHOTO_MAX_PER_GROUP', () => {
  it('is optional: unset falls back to the documented default', async () => {
    const { DEFAULT_MAX_PHOTOS_PER_GROUP } = await import('@/lib/photos/constants')
    await expect(capWith(undefined)).resolves.toBe(DEFAULT_MAX_PHOTOS_PER_GROUP)
  })

  it('is what actually gets enforced when set', async () => {
    // The point of the whole change: a number in Vercel, not a number in a commit.
    await expect(capWith('35')).resolves.toBe(35)
    reset()
    await expect(capWith('3')).resolves.toBe(3)
  })

  it('accepts the ceiling exactly', async () => {
    const { PHOTO_CAP_CEILING } = await import('@/lib/photos/constants')
    reset()
    await expect(capWith(String(PHOTO_CAP_CEILING))).resolves.toBe(PHOTO_CAP_CEILING)
  })

  for (const [label, value] of [
    ['zero — an upload button nobody can use', '0'],
    ['negative', '-5'],
    ['fractional — a typo, not a cap', '20.5'],
    ['not a number at all', 'twenty'],
    ['past the ceiling — a storage bill', '500'],
  ] as const) {
    it(`refuses ${label} at import time`, async () => {
      process.env.PHOTO_MAX_PER_GROUP = value
      await expect(import('@/lib/photos/cap')).rejects.toThrow(/PHOTO_MAX_PER_GROUP/)
    })
  }
})

describe('the bounds agree with each other', () => {
  it('the default is itself a legal value', async () => {
    const { DEFAULT_MAX_PHOTOS_PER_GROUP, PHOTO_CAP_CEILING } =
      await import('@/lib/photos/constants')
    expect(DEFAULT_MAX_PHOTOS_PER_GROUP).toBeGreaterThanOrEqual(1)
    expect(DEFAULT_MAX_PHOTOS_PER_GROUP).toBeLessThanOrEqual(PHOTO_CAP_CEILING)
  })

  /*
   * The trap this whole file exists to catch. F03a's CreateExpenseInput carries its own
   * `.max()` on the photos array, deliberately spelled as a literal so a wave-1 module does
   * not import F06's constants. If that literal ever drops below PHOTO_CAP_CEILING it
   * becomes the real cap — and PHOTO_MAX_PER_GROUP silently stops working above it, with
   * every other assertion in this file still green.
   */
  it('F03a structural bound does not undercut the ceiling', async () => {
    const { PHOTO_CAP_CEILING } = await import('@/lib/photos/constants')
    const { CreateExpenseInput } = await import('@/lib/schema/expense')

    const photo = {
      blobUrl: 'https://example.public.blob.vercel-storage.com/photos/a.jpg',
      blobPathname: 'photos/a.jpg',
      width: 100,
      height: 100,
      sizeBytes: 1000,
    }
    const base = {
      title: 'Belanja',
      occurred_on: '2026-08-26',
      items: [{ name: 'roti', amount_idr: 38500, category: 'snacks' }],
    }

    const atCeiling = CreateExpenseInput.safeParse({
      ...base,
      photos: Array.from({ length: PHOTO_CAP_CEILING }, () => photo),
    })

    // If this fails, read the comment above before touching the number.
    expect(atCeiling.success).toBe(true)
  })
})
