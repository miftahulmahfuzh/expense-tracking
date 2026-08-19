/**
 * F06 Task 8 — the two strings the upload tile renders.
 *
 * Small surface, but it is the only user-visible output of the compression stage, and
 * it is written in Indonesian conventions: comma as the decimal separator. A refactor
 * to `Intl.NumberFormat` defaults or to en-US would silently turn "4,2 MB" into
 * "4.2 MB", which in this locale reads as *four thousand two hundred* megabytes.
 */
import { describe, expect, it } from 'vitest'

import { formatBytes, formatSavings } from '@/lib/photos/format'

describe('formatBytes', () => {
  it('renders bytes below 1 KiB verbatim', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('renders KB as a whole number', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(287_000)).toBe('280 KB')
    // 300 KB, the compression target, is the number the QA table checks against.
    expect(formatBytes(307_200)).toBe('300 KB')
  })

  it('renders MB to one decimal, id-ID style (comma, not dot)', () => {
    expect(formatBytes(4 * 1024 * 1024)).toBe('4 MB')
    expect(formatBytes(4.25 * 1024 * 1024)).toBe('4,3 MB')
    // The rejection message for an oversized pick quotes this exact value.
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB')
  })

  it('never emits a dot as the decimal separator', () => {
    for (const n of [1_500_000, 3_800_000, 12_345_678, 25 * 1024 * 1024]) {
      expect(formatBytes(n)).not.toMatch(/\d\.\d/)
    }
  })
})

describe('formatSavings', () => {
  it('reads like the tile in the plan: "3,6 MB → 235 KB (94% lebih kecil)"', () => {
    expect(formatSavings(3_800_000, 241_000)).toBe('3,6 MB → 235 KB (94% lebih kecil)')
  })

  it('clamps at 0% when compression did not shrink the file', () => {
    expect(formatSavings(100_000, 120_000)).toContain('(0% lebih kecil)')
  })

  it('does not divide by zero on an empty original', () => {
    expect(formatSavings(0, 0)).toBe('0 B → 0 B (0% lebih kecil)')
  })
})
