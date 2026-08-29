import { describe, expect, it } from 'vitest'
import { CATEGORIES } from '@/lib/categories'
import { ParsedExpense, ParsedItem } from '@/lib/schema/expense'

/**
 * `ParsedExpense` is the single boundary type between F04 and F05 (roadmap §4.3), and
 * byte-for-byte the shape of the `record_expense` tool's `input_schema`. F03 owns the
 * module; these tests pin the specific guarantees `parseExpense` leans on when it
 * decides whether an LLM response is trustworthy:
 *
 *   - a stringy or fractional `amount_idr` is REJECTED, so the 1000× bug (`38.5`) can
 *     never reach the database — it triggers the repair round-trip instead;
 *   - `occurred_on` must already be ISO, so a `18/8/2026` echo is caught here;
 *   - the category enum is closed, so a hallucinated `makanan` is caught here.
 *
 * If one of these ever loosens, `parseExpense`'s validate-then-repair strategy silently
 * stops working, and nothing else in the suite would notice.
 */

const ok = {
  title: 'bakar duit tuesday',
  occurred_on: '2026-08-18',
  items: [{ name: 'roti buaya', amount_idr: 38500, category: 'meals' }],
}

describe('ParsedExpense contract', () => {
  it('accepts a well-formed expense', () => {
    expect(ParsedExpense.parse(ok)).toEqual(ok)
  })

  it('trims the title and rejects a blank one', () => {
    expect(ParsedExpense.parse({ ...ok, title: '  hi  ' }).title).toBe('hi')
    expect(() => ParsedExpense.parse({ ...ok, title: '   ' })).toThrow()
    expect(() => ParsedExpense.parse({ ...ok, title: 'x'.repeat(121) })).toThrow()
  })

  it('enforces the YYYY-MM-DD shape', () => {
    for (const bad of ['18/8/2026', '2026-8-18', '20260818', '2026-08-18T00:00:00Z', '']) {
      expect(() => ParsedExpense.parse({ ...ok, occurred_on: bad }), bad).toThrow()
    }
  })

  it('requires 1..50 items', () => {
    expect(() => ParsedExpense.parse({ ...ok, items: [] })).toThrow()
    const many = Array.from({ length: 51 }, () => ok.items[0])
    expect(() => ParsedExpense.parse({ ...ok, items: many })).toThrow()
  })
})

describe('ParsedItem contract', () => {
  const item = ok.items[0]!

  it('rejects a string amount — the LLM must send a number', () => {
    expect(() => ParsedItem.parse({ ...item, amount_idr: '38500' })).toThrow()
    expect(() => ParsedItem.parse({ ...item, amount_idr: '38.500' })).toThrow()
  })

  it('rejects a non-integer amount', () => {
    expect(() => ParsedItem.parse({ ...item, amount_idr: 38.5 })).toThrow()
    expect(() => ParsedItem.parse({ ...item, amount_idr: 38500.01 })).toThrow()
  })

  it('rejects a negative amount and accepts zero', () => {
    expect(() => ParsedItem.parse({ ...item, amount_idr: -1 })).toThrow()
    expect(ParsedItem.parse({ ...item, amount_idr: 0 }).amount_idr).toBe(0)
  })

  it('caps at 1_000_000_000', () => {
    expect(() => ParsedItem.parse({ ...item, amount_idr: 1_000_000_001 })).toThrow()
  })

  it('accepts exactly the 17 categories and nothing else', () => {
    for (const c of CATEGORIES) {
      expect(ParsedItem.parse({ ...item, category: c }).category).toBe(c)
    }
    expect(CATEGORIES.length).toBe(17)
    for (const bad of ['Food', 'FOOD', 'makanan', 'travel', '', null]) {
      expect(() => ParsedItem.parse({ ...item, category: bad }), String(bad)).toThrow()
    }
  })

  it('rejects a blank or overlong name', () => {
    expect(() => ParsedItem.parse({ ...item, name: '   ' })).toThrow()
    expect(() => ParsedItem.parse({ ...item, name: 'x'.repeat(121) })).toThrow()
  })
})
