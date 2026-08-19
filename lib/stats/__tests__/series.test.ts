import { describe, expect, it } from 'vitest'

import {
  buildMonthSeries,
  chartWindowLength,
  computeDelta,
  largestRemainderPct,
  toIdr,
  type DeltaBasis,
} from '../series'

describe('toIdr', () => {
  it('survives the numeric-as-string driver behaviour', () => {
    expect(toIdr('266350')).toBe(266350)
    expect(toIdr(266350)).toBe(266350)
    expect(toIdr(266350n)).toBe(266350)
  })

  it('degrades to 0 rather than NaN', () => {
    expect(toIdr(null)).toBe(0)
    expect(toIdr(undefined)).toBe(0)
    expect(toIdr('bakar duit')).toBe(0)
    expect(toIdr(Number.NaN)).toBe(0)
    expect(toIdr(Number.POSITIVE_INFINITY)).toBe(0)
    expect(toIdr({})).toBe(0)
  })
})

describe('buildMonthSeries', () => {
  // Guards the invariant end-to-end: sparse in, dense out. F03 normally hands us dense
  // rows already, so this also proves the decoration is idempotent.
  it('inserts an explicit zero for a month with no rows', () => {
    const s = buildMonthSeries(
      [
        { month: '2026-06', totalIdr: '100000' },
        { month: '2026-08', totalIdr: 300000 },
      ],
      '2026-08',
      3,
      '2026-08',
    )
    expect(s.map((p) => p.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(s.map((p) => p.totalIdr)).toEqual([100000, 0, 300000])
  })

  it('crosses a year boundary correctly', () => {
    const s = buildMonthSeries([], '2026-01', 3, '2026-01')
    expect(s.map((p) => p.month)).toEqual(['2025-11', '2025-12', '2026-01'])
    expect(s.map((p) => p.label)).toEqual(['Nov', 'Des', 'Jan'])
  })

  it('flags only the current month as partial', () => {
    const s = buildMonthSeries([], '2026-08', 3, '2026-08')
    expect(s.map((p) => p.isPartial)).toEqual([false, false, true])
  })

  it('flags nothing as partial when a past month is the window end', () => {
    const s = buildMonthSeries([], '2026-05', 3, '2026-08')
    expect(s.some((p) => p.isPartial)).toBe(false)
  })

  // The page over-fetches one extra month so the earliest visible month still has a
  // previous month to compare against. Those extra rows must not reach the chart.
  it('drops rows outside the requested window', () => {
    const s = buildMonthSeries(
      [
        { month: '2026-05', totalIdr: 999999 },
        { month: '2026-08', totalIdr: 300000 },
      ],
      '2026-08',
      3,
      '2026-08',
    )
    expect(s).toHaveLength(3)
    expect(s.map((p) => p.month)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(s.some((p) => p.totalIdr === 999999)).toBe(false)
  })
})

describe('chartWindowLength', () => {
  it('floors at 3 and caps at 12', () => {
    expect(chartWindowLength(null, '2026-08')).toBe(3)
    expect(chartWindowLength('2026-08', '2026-08')).toBe(3) // 1 month of span -> 3
    expect(chartWindowLength('2026-06', '2026-08')).toBe(3) // 3 months of span -> 3
    expect(chartWindowLength('2026-03', '2026-08')).toBe(6)
    expect(chartWindowLength('2025-09', '2026-08')).toBe(12)
    expect(chartWindowLength('2020-01', '2026-08')).toBe(12)
  })
})

describe('computeDelta', () => {
  const full: DeltaBasis = { mode: 'full', previousMonth: '2026-07' }
  const mtd: DeltaBasis = { mode: 'mtd', previousMonth: '2026-07', throughDay: 19 }

  it('does not divide by zero when last month was empty', () => {
    expect(computeDelta(500000, 0, full)).toMatchObject({ kind: 'first', currentIdr: 500000 })
  })

  it('reports nothing when both periods are empty', () => {
    expect(computeDelta(0, 0, full).kind).toBe('none')
  })

  it('reports -100% when spend went to zero', () => {
    expect(computeDelta(0, 400000, full)).toMatchObject({
      kind: 'pct',
      pct: -100,
      direction: 'down',
    })
  })

  it('rounds to 1dp under 10% and 0dp above', () => {
    expect(computeDelta(1_012_000, 1_000_000, full)).toMatchObject({ pct: 1.2, direction: 'up' })
    expect(computeDelta(1_250_000, 1_000_000, full)).toMatchObject({ pct: 25, direction: 'up' })
  })

  it('calls a sub-0.5% move flat', () => {
    expect(computeDelta(1_002_000, 1_000_000, full)).toMatchObject({ direction: 'flat' })
    expect(computeDelta(1_000_000, 1_000_000, full)).toMatchObject({ pct: 0, direction: 'flat' })
  })

  it('carries the basis through untouched, so the tile can always state it', () => {
    expect(computeDelta(0, 0, mtd).basis).toEqual(mtd)
    expect(computeDelta(1, 0, mtd).basis).toEqual(mtd)
    expect(computeDelta(2, 1, mtd).basis).toEqual(mtd)
  })
})

describe('largestRemainderPct', () => {
  it('always sums to exactly 100', () => {
    const sets = [
      [1, 1, 1],
      [333, 333, 334],
      [862000, 431500, 200, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [999999999, 1],
    ]
    for (const set of sets) {
      expect(largestRemainderPct(set).reduce((a, b) => a + b, 0)).toBe(100)
    }
  })

  it('returns all zeros for an empty month', () => {
    expect(largestRemainderPct([0, 0])).toEqual([0, 0])
    expect(largestRemainderPct([])).toEqual([])
  })

  it('gives a single category the whole 100', () => {
    expect(largestRemainderPct([266350])).toEqual([100])
  })

  it('breaks a remainder tie on the earlier index, so the output is deterministic', () => {
    // Three equal thirds: 33.33 each, floor 33, three left over -> 34/33/33.
    expect(largestRemainderPct([1, 1, 1])).toEqual([34, 33, 33])
  })

  it('never awards a percent to a zero-amount row', () => {
    const out = largestRemainderPct([100, 0, 0])
    expect(out).toEqual([100, 0, 0])
  })
})
