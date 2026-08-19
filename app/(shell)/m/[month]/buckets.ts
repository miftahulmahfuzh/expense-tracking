import type { DateISO } from '@/lib/format'
import type { MonthGroupRow } from '@/lib/db/queries'

/**
 * Pure shaping of `getMonthGroups`' rows into what the month screen renders. Kept out of
 * `page.tsx` so it can be unit-tested without a database, a session or a renderer.
 *
 * THE ONE INVARIANT IT RELIES ON: `getMonthGroups` already sorts `occurred_on DESC,
 * created_at DESC`, so a single linear pass produces day buckets in display order. If that
 * ordering ever changes, this silently starts emitting a bucket per row — which is why
 * `buckets.test.ts` feeds it an unsorted list and asserts that days are never split.
 */

export interface DayBucket {
  /** 'YYYY-MM-DD' */
  day: DateISO
  rows: MonthGroupRow[]
  totalIdr: number
}

export function bucketByDay(rows: readonly MonthGroupRow[]): DayBucket[] {
  const buckets: DayBucket[] = []
  const byDay = new Map<string, DayBucket>()

  for (const row of rows) {
    const existing = byDay.get(row.occurredOn)
    if (existing) {
      // Not `buckets[buckets.length - 1]`: a same-day row arriving after a different day
      // would otherwise open a second bucket for a day that already has one, and the screen
      // would show "Selasa, 18 Agustus" twice. Costs one Map; removes a whole class of bug
      // if the query's ORDER BY is ever relaxed.
      existing.rows.push(row)
      existing.totalIdr += row.totalIdr
      continue
    }
    const bucket: DayBucket = { day: row.occurredOn, rows: [row], totalIdr: row.totalIdr }
    byDay.set(row.occurredOn, bucket)
    buckets.push(bucket)
  }

  return buckets
}

export interface MonthSummary {
  /** THE number on the screen. Roadmap A6 / D7: summed from the rows already fetched, never a second query. */
  totalIdr: number
  /** "catatan" — one per expense group (design R-40's meta line). */
  groupCount: number
  itemCount: number
}

export function summariseMonth(rows: readonly MonthGroupRow[]): MonthSummary {
  let totalIdr = 0
  let itemCount = 0
  for (const row of rows) {
    totalIdr += row.totalIdr
    itemCount += row.itemCount
  }
  return { totalIdr, groupCount: rows.length, itemCount }
}
