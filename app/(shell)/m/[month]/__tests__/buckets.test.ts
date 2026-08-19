/**
 * Day bucketing and the month summary — the two pure functions behind the month screen.
 *
 * What matters here is the money: `summariseMonth` produces THE number on the screen, and
 * `bucketByDay` produces the per-day subtotals under each heading. Both are summed from the
 * rows `getMonthGroups` already returned (roadmap A6 / D7 — no second query, no denormalised
 * column), so a bug here is a wrong total with nothing failing anywhere.
 */
import { describe, expect, it } from 'vitest'

import type { MonthGroupRow } from '@/lib/db/queries'

import { bucketByDay, summariseMonth } from '../buckets'

function row(partial: Partial<MonthGroupRow> & { id: string; occurredOn: string }): MonthGroupRow {
  return {
    title: `catatan ${partial.id}`,
    note: null,
    totalIdr: 0,
    itemCount: 0,
    photoCount: 0,
    firstPhotoUrl: null,
    ...partial,
  }
}

/** The roadmap §1 canonical group, plus two more across two days. */
const rows: MonthGroupRow[] = [
  row({ id: 'g1', occurredOn: '2026-08-18', totalIdr: 266_350, itemCount: 6, photoCount: 2 }),
  row({ id: 'g2', occurredOn: '2026-08-18', totalIdr: 44_000, itemCount: 2 }),
  row({ id: 'g3', occurredOn: '2026-08-15', totalIdr: 1_250_000, itemCount: 1, photoCount: 1 }),
]

describe('bucketByDay', () => {
  it('groups by day, preserving the query order of both days and rows', () => {
    const buckets = bucketByDay(rows)

    expect(buckets.map((b) => b.day)).toEqual(['2026-08-18', '2026-08-15'])
    expect(buckets[0]!.rows.map((r) => r.id)).toEqual(['g1', 'g2'])
    expect(buckets[1]!.rows.map((r) => r.id)).toEqual(['g3'])
  })

  it('sums each day', () => {
    const buckets = bucketByDay(rows)

    expect(buckets[0]!.totalIdr).toBe(310_350)
    expect(buckets[1]!.totalIdr).toBe(1_250_000)
  })

  it('never splits a day, even if the rows arrive unsorted', () => {
    // The shipped query sorts occurred_on DESC, so this cannot happen today. It is asserted
    // because a linear "compare with the previous row" pass would render the same day heading
    // twice the moment that ORDER BY is relaxed, and nothing would fail.
    const shuffled = [rows[0]!, rows[2]!, rows[1]!]
    const buckets = bucketByDay(shuffled)

    expect(buckets).toHaveLength(2)
    expect(buckets[0]!.rows.map((r) => r.id)).toEqual(['g1', 'g2'])
    expect(buckets[0]!.totalIdr).toBe(310_350)
  })

  it('returns nothing for an empty month, which is what drives the empty state', () => {
    expect(bucketByDay([])).toEqual([])
  })
})

describe('summariseMonth', () => {
  it('totals the month and counts catatan and item (design R-40s meta line)', () => {
    expect(summariseMonth(rows)).toEqual({
      totalIdr: 1_560_350,
      groupCount: 3,
      itemCount: 9,
    })
  })

  it('reads Rp 0 / 0 catatan for an empty month rather than throwing', () => {
    expect(summariseMonth([])).toEqual({ totalIdr: 0, groupCount: 0, itemCount: 0 })
  })

  it('counts a group with no items, whose total is 0 (D7: SUM of nothing)', () => {
    const summary = summariseMonth([row({ id: 'g9', occurredOn: '2026-08-02' })])
    expect(summary).toEqual({ totalIdr: 0, groupCount: 1, itemCount: 0 })
  })
})
