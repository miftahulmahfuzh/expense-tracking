// F03a Task 2 — lib/categories.ts.
//
// The exported shape here is fixed by reconciliation R-7: F03's version wins over
// F10's, verbatim, because F08 has already built against `CATEGORY_META` and against
// `CategoryMeta.color` being the custom-property NAME (`--color-cat-<id>`), not a value.
// F10 owns the *values* of those properties in app/globals.css; this module owns the names.
//
// One field changed after the Claude Design pull: DESIGN_INTEGRATION.md R-34 replaces
// `emoji` with a two-letter mono `code`. The assertions below are the contract for it.

import { describe, expect, it } from 'vitest'
import {
  CATEGORIES,
  CATEGORY_LIST,
  CATEGORY_META,
  DEFAULT_CATEGORY,
  categoryFill,
  categoryMeta,
  categoryStyle,
  isCategory,
  toCategory,
} from '@/lib/categories'

describe('CATEGORIES', () => {
  it('has exactly the 17 roadmap §4.1 slugs, in picker order', () => {
    // F14 (card #6) replaced the original eight. Order is by FAMILY — eating, transport,
    // bills & home, leisure, health, other — and it is load-bearing twice over: it is the
    // picker's grid order and F08's chart series order, so a colour means the same thing
    // in the same place in both.
    expect(CATEGORIES).toEqual([
      'meals',
      'jajan',
      'dining',
      'snacks',
      'drinks',
      'transport',
      'fuel',
      'parking',
      'bills',
      'internet',
      'utilities',
      'housing',
      'entertainment',
      'cinema',
      'health',
      'grooming',
      'other',
    ])
    expect(CATEGORIES).toHaveLength(17)
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

  it('uses distinct labels, codes and colour tokens', () => {
    const labels = CATEGORIES.map((c) => CATEGORY_META[c].label)
    const codes = CATEGORIES.map((c) => CATEGORY_META[c].code)
    const colors = CATEGORIES.map((c) => CATEGORY_META[c].color)
    expect(new Set(labels).size).toBe(CATEGORIES.length)
    expect(new Set(codes).size).toBe(CATEGORIES.length)
    expect(new Set(colors).size).toBe(CATEGORIES.length)
  })

  it('names a --color-cat-* custom property matching the category id', () => {
    for (const id of CATEGORIES) {
      expect(CATEGORY_META[id].color).toMatch(/^--color-cat-[a-z]+$/)
      expect(CATEGORY_META[id].color).toBe(`--color-cat-${id}`)
    }
  })

  it('uses a two-letter uppercase ASCII code as the chip glyph (design R-34)', () => {
    // Two chars exactly: the code sits in a 22px column on F08's bar list and next to a
    // 14px amount in an item row. Three would not fit; one would not disambiguate.
    for (const id of CATEGORIES) {
      expect(CATEGORY_META[id].code).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('maps each category to its two-letter code', () => {
    // Unique across all 17 — the code, not the colour, is what makes a category
    // unambiguous once the palette is past the number of tellable-apart hues.
    expect(CATEGORIES.map((c) => CATEGORY_META[c].code)).toEqual([
      'MH', // Makan Harian
      'JJ', // Jajan
      'FM', // Fancy Makan Berat
      'SN', // Snack
      'BV', // Beverage
      'TR', // Transport
      'BN', // Bensin
      'PK', // Sewa Parkir Motor
      'TG', // Tagihan
      'IN', // Internet
      'LA', // Listrik & Air Apart
      'TT', // Tempat Tinggal
      'HB', // Hiburan
      'BS', // Bioskop
      'KS', // Kesehatan
      'PR', // Pangkas Rambut
      'LN', // Lainnya
    ])
  })
})

describe('categoryStyle / categoryFill', () => {
  it('feeds .chip and .cell a single --c custom property', () => {
    // globals.css reads exactly one property, so all 17 categories share one CSS rule.
    expect(categoryStyle('meals')).toEqual({ '--c': 'var(--color-cat-meals)' })
  })

  it('resolves through the alias globals.css declares at :root', () => {
    for (const id of CATEGORIES) {
      expect(categoryFill(id)).toBe(`var(--color-cat-${id})`)
      expect(categoryFill(id)).toBe(`var(${CATEGORY_META[id].color})`)
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
    expect(isCategory(['meals'])).toBe(false)
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
