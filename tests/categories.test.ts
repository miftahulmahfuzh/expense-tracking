// F03a Task 2 — lib/categories.ts.
//
// The exported shape here is fixed by reconciliation R-7: F03's version wins over
// F10's, verbatim, because F08 has already built against `CATEGORY_META` and against
// `CategoryMeta.color` being the custom-property NAME (`--color-cat-<id>`), not a value.
// F10 owns the *values* of those properties in app/globals.css; this module owns the names.

import { describe, expect, it } from 'vitest'
import {
  CATEGORIES,
  CATEGORY_LIST,
  CATEGORY_META,
  DEFAULT_CATEGORY,
  categoryMeta,
  isCategory,
  toCategory,
} from '@/lib/categories'

describe('CATEGORIES', () => {
  it('has exactly the 8 roadmap §4.1 slugs, in picker order', () => {
    expect(CATEGORIES).toEqual([
      'food',
      'groceries',
      'transport',
      'bills',
      'housing',
      'entertainment',
      'health',
      'other',
    ])
    // Exactly 8 so the picker fits a 2×4 tap grid (F07/F10).
    expect(CATEGORIES).toHaveLength(8)
  })

  it('has no duplicates', () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length)
  })

  it("defaults to 'other'", () => {
    expect(DEFAULT_CATEGORY).toBe('other')
    expect(CATEGORIES).toContain(DEFAULT_CATEGORY)
  })
})

describe('CATEGORY_META', () => {
  it('has one entry per category, keyed by its own id', () => {
    expect(Object.keys(CATEGORY_META)).toEqual([...CATEGORIES])
    for (const id of CATEGORIES) {
      expect(CATEGORY_META[id].id).toBe(id)
    }
  })

  it('carries a non-empty Indonesian label and a hint for every category', () => {
    for (const id of CATEGORIES) {
      expect(CATEGORY_META[id].label.length).toBeGreaterThan(0)
      expect(CATEGORY_META[id].hint.length).toBeGreaterThan(0)
    }
  })

  it('uses distinct labels, emoji and colour tokens', () => {
    const labels = CATEGORIES.map((c) => CATEGORY_META[c].label)
    const emoji = CATEGORIES.map((c) => CATEGORY_META[c].emoji)
    const colors = CATEGORIES.map((c) => CATEGORY_META[c].color)
    expect(new Set(labels).size).toBe(8)
    expect(new Set(emoji).size).toBe(8)
    expect(new Set(colors).size).toBe(8)
  })

  it('names a --color-cat-* custom property matching the category id', () => {
    for (const id of CATEGORIES) {
      expect(CATEGORY_META[id].color).toMatch(/^--color-cat-[a-z]+$/)
      expect(CATEGORY_META[id].color).toBe(`--color-cat-${id}`)
    }
  })

  it('uses a single-codepoint-cluster emoji as the chip glyph', () => {
    for (const id of CATEGORIES) {
      expect([...new Intl.Segmenter().segment(CATEGORY_META[id].emoji)]).toHaveLength(1)
    }
  })
})

describe('CATEGORY_LIST', () => {
  it('is CATEGORY_META in CATEGORIES order — the 2×4 grid order', () => {
    expect(CATEGORY_LIST.map((m) => m.id)).toEqual([...CATEGORIES])
    for (const [i, id] of CATEGORIES.entries()) {
      expect(CATEGORY_LIST[i]).toBe(CATEGORY_META[id])
    }
  })
})

describe('isCategory', () => {
  it('accepts every known slug', () => {
    for (const id of CATEGORIES) expect(isCategory(id)).toBe(true)
  })

  it('is case-sensitive and rejects non-strings', () => {
    expect(isCategory('Food')).toBe(false)
    expect(isCategory('makanan')).toBe(false)
    expect(isCategory('')).toBe(false)
    expect(isCategory(null)).toBe(false)
    expect(isCategory(undefined)).toBe(false)
    expect(isCategory(0)).toBe(false)
    expect(isCategory(['food'])).toBe(false)
  })

  it('does not match Object.prototype keys', () => {
    expect(isCategory('toString')).toBe(false)
    expect(isCategory('constructor')).toBe(false)
  })
})

describe('categoryMeta / toCategory', () => {
  it('round-trips a known slug', () => {
    expect(categoryMeta('transport')).toBe(CATEGORY_META.transport)
    expect(toCategory('transport')).toBe('transport')
  })

  it("never throws — unknown input degrades to 'other'", () => {
    expect(categoryMeta('nonsense').id).toBe('other')
    expect(categoryMeta('').id).toBe('other')
    expect(categoryMeta('toString').id).toBe('other')
    expect(toCategory(undefined)).toBe('other')
    expect(toCategory(null)).toBe('other')
    expect(toCategory(42)).toBe('other')
    expect(toCategory('Makanan')).toBe('other')
  })
})
