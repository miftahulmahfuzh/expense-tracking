/**
 * Route-param validation for `/m/[month]`. Every value this rejects must render the 404 page.
 *
 * The year bound is the part worth pinning: reconciliation R-45 ruled that F03's shared
 * `isValidMonthKey` keeps its shape-only contract (three features and `MonthKeySchema` build
 * on it) and that F07 adds the range check at the ROUTE boundary. If someone later "unifies"
 * the two, `/m/0001-01` starts costing a database round trip per crawl.
 */
import { describe, expect, it } from 'vitest'

import { isValidMonthKey } from '@/lib/format'

import { isSupportedMonthKey, MAX_MONTH_YEAR, MIN_MONTH_YEAR } from '../monthParam'

describe('isSupportedMonthKey', () => {
  it('accepts every month of a plausible year', () => {
    for (const month of ['2026-01', '2026-08', '2026-12', '2000-01', '2100-12']) {
      expect(isSupportedMonthKey(month)).toBe(true)
    }
  })

  it('rejects malformed keys', () => {
    for (const bad of [
      '2026-13',
      '2026-00',
      '2026-8',
      '26-08',
      '2026-08-18',
      'agustus',
      '2026_08',
      ' 2026-08',
      '',
    ]) {
      expect(isSupportedMonthKey(bad)).toBe(false)
    }
  })

  it('rejects years outside the supported range — the R-45 delta', () => {
    for (const outOfRange of ['1899-08', '1999-12', '2101-01', '9999-12', '0001-01']) {
      // Shape-valid, so the shared validator says yes...
      expect(isValidMonthKey(outOfRange)).toBe(true)
      // ...and the route boundary is what says no.
      expect(isSupportedMonthKey(outOfRange)).toBe(false)
    }
  })

  it('is inclusive at both bounds', () => {
    expect(isSupportedMonthKey(`${MIN_MONTH_YEAR}-01`)).toBe(true)
    expect(isSupportedMonthKey(`${MAX_MONTH_YEAR}-12`)).toBe(true)
    expect(isSupportedMonthKey(`${MIN_MONTH_YEAR - 1}-12`)).toBe(false)
    expect(isSupportedMonthKey(`${MAX_MONTH_YEAR + 1}-01`)).toBe(false)
  })
})
