import { describe, expect, it } from 'vitest'
import { FIXTURES } from '../__fixtures__'

/**
 * The corpus asserts things about the parsers, so the corpus itself has to be right
 * first. A fixture whose `amounts` do not sum to its `total`, or whose `categories`
 * array is one short, would silently weaken every test downstream of it.
 */
describe('fixture corpus', () => {
  it('has at least 10 fixtures', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(10)
  })

  it('every fixture is internally consistent', () => {
    for (const fx of FIXTURES) {
      expect(fx.rawText.trim(), fx.id).not.toBe('')
      expect(fx.expect.amounts.length, `${fx.id} amounts`).toBe(fx.expect.itemCount)
      expect(fx.expect.categories.length, `${fx.id} categories`).toBe(fx.expect.itemCount)
      expect(
        fx.expect.amounts.reduce((a, b) => a + b, 0),
        `${fx.id} total`,
      ).toBe(fx.expect.total)
      expect(fx.expect.occurredOn, `${fx.id} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const n of fx.expect.amounts) {
        expect(Number.isInteger(n), `${fx.id} integer`).toBe(true)
      }
    }
  })

  it('has unique ids', () => {
    expect(new Set(FIXTURES.map((f) => f.id)).size).toBe(FIXTURES.length)
  })

  it('canonical fixture matches the roadmap total', () => {
    expect(FIXTURES[0]!.expect.total).toBe(266_350)
  })
})
