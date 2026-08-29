/**
 * F03b Tasks 14–18 (+ reconciliation R-14, R-15, R-22) — the read layer.
 *
 * Every assertion runs the exported function against a fake Neon client and inspects the
 * statements it actually emitted. Three classes of bug are being guarded against:
 *
 *   1. A read that forgets `user_id` — one signed-in user seeing another's expenses.
 *   2. A LEFT JOIN fan-out inflating SUM and COUNT (items × photos) on /m/[month].
 *   3. An N+1: getGroupDetail and getGroupByShareToken must each cost ONE round trip.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => import('./support/probeDb'))

import {
  fillZeroMonths,
  getBiggestExpense,
  getCategoryBreakdown,
  getGroupByShareToken,
  getGroupDetail,
  getInsightWatermark,
  getItemsForWindow,
  getMonthGroups,
  getMonthlyTotals,
  getMonthToDatePair,
  getPhotoByShareToken,
} from '@/lib/db/queries'

import { calls, normalise, queueRows, reset } from './support/probeDb'

const flat = (i = 0) => normalise(calls[i]!.sql)

beforeEach(reset)

describe('getMonthGroups', () => {
  it('scopes to the user and brackets the month with a half-open range', async () => {
    await getMonthGroups('u1', '2026-08')

    expect(calls).toHaveLength(1)
    expect(flat()).toContain('"expense_groups"."user_id" = $')
    // The leading 1 is the `limit 1` of the firstPhotoUrl sub-select, which Drizzle
    // parameterises and which appears in the select list, ahead of the WHERE bindings.
    expect(calls[0]!.params).toEqual([1, 'u1', '2026-08-01', '2026-09-01'])
  })

  it('computes the aggregates as correlated subqueries, never a join (no fan-out)', async () => {
    await getMonthGroups('u1', '2026-08')
    const sql = flat()

    expect(sql).not.toMatch(/\bjoin\b/i)
    expect(sql).toMatch(/select coalesce\(sum\("amount_idr"\), 0\) from "expense_items"/i)
    expect(sql.match(/select count\(\*\)/gi)).toHaveLength(2) // items + photos

    // Each aggregate must correlate to the OUTER expense_groups row. Unqualified
    // identifiers here would resolve inside the subquery's own table and match nothing —
    // the silent Rp 0 bug (R-54).
    expect(sql.match(/"expense_items"\."group_id" = "expense_groups"\."id"/g)).toHaveLength(2)
    expect(sql.match(/"expense_photos"\."group_id" = "expense_groups"\."id"/g)).toHaveLength(2)

    // R-14: the thumbnail URL comes from the same round trip, lowest sort_order first.
    expect(sql).toContain('select "blob_url" from "expense_photos"')
    expect(sql).toMatch(
      /order by "expense_photos"\."sort_order" asc, "expense_photos"\."created_at" asc limit \$/i,
    )
  })

  it('orders newest day first, then newest created first', async () => {
    await getMonthGroups('u1', '2026-08')
    expect(flat()).toMatch(
      /order by "expense_groups"\."occurred_on" desc, "expense_groups"\."created_at" desc/i,
    )
  })

  it('returns numbers for the aggregates and null when a group has no photo', async () => {
    queueRows([
      ['grp000000001', 'bakar duit tuesday', '2026-08-18', null, '266350', '6', '0', null],
    ])
    const [row] = await getMonthGroups('u1', '2026-08')

    expect(row).toEqual({
      id: 'grp000000001',
      title: 'bakar duit tuesday',
      occurredOn: '2026-08-18',
      note: null,
      totalIdr: 266350,
      itemCount: 6,
      photoCount: 0,
      firstPhotoUrl: null,
    })
    // The bigint-as-string regression: 266350 + 1 must be 266351, not '2663501'.
    expect(typeof row!.totalIdr).toBe('number')
    expect(row!.totalIdr + 1).toBe(266351)
  })

  it('rejects a malformed month before it reaches the database', async () => {
    await expect(getMonthGroups('u1', '2026-13')).rejects.toBeInstanceOf(RangeError)
    expect(calls).toHaveLength(0)
  })
})

describe('getGroupDetail', () => {
  const queueEmptyDetail = () => {
    queueRows([]) // group
    queueRows([]) // items
    queueRows([]) // photos
    queueRows([]) // share link
  }

  it('costs exactly one round trip — four statements in one batch', async () => {
    queueEmptyDetail()
    await getGroupDetail('u1', 'grp000000001')
    expect(calls).toHaveLength(4)
  })

  it('carries user_id on every one of the four statements', async () => {
    queueEmptyDetail()
    await getGroupDetail('u1', 'grp000000001')

    for (let i = 0; i < 4; i++) {
      expect(flat(i), `statement ${i}`).toContain('"expense_groups"."user_id"')
      expect(calls[i]!.params, `statement ${i}`).toContain('u1')
    }
    // Statement 0 filters directly; 1–3 prove ownership with EXISTS.
    expect(flat(0)).not.toMatch(/exists/i)
    for (let i = 1; i < 4; i++) expect(flat(i)).toMatch(/exists/i)
  })

  it('orders items and photos deterministically', async () => {
    queueEmptyDetail()
    await getGroupDetail('u1', 'grp000000001')

    expect(flat(1)).toMatch(
      /order by "expense_items"\."sort_order" asc, "expense_items"\."id" asc/i,
    )
    expect(flat(2)).toMatch(
      /order by "expense_photos"\."sort_order" asc, "expense_photos"\."created_at" asc/i,
    )
  })

  it('never selects user_id or any other user column into the payload', async () => {
    queueEmptyDetail()
    await getGroupDetail('u1', 'grp000000001')
    const selectList = flat(0).slice(0, flat(0).indexOf(' from '))
    expect(selectList).not.toContain('user_id')
    expect(selectList).not.toContain('"user"')
  })

  it('returns null when the group is missing or owned by someone else', async () => {
    queueEmptyDetail()
    await expect(getGroupDetail('u2', 'grp000000001')).resolves.toBeNull()
  })

  it('assembles the detail, coerces categories and sums the total in JS', async () => {
    queueRows([
      [
        'grp000000001',
        'bakar duit tuesday',
        '2026-08-18',
        null,
        'roti buaya 38500',
        '2026-08-18T03:00:00.000Z',
        '2026-08-18T03:00:00.000Z',
      ],
    ])
    queueRows([
      ['itm000000001', 'roti buaya', '38500', 'meals', 0],
      ['itm000000002', 'perumahan laddaland', '49000', 'nonsense-from-the-llm', 1],
    ])
    queueRows([['pht000000001', 'https://blob/x.jpg', 'photos/x.jpg', 1200, 1600, 250000, 0]])
    queueRows([['shr000000001']])

    const detail = await getGroupDetail('u1', 'grp000000001')

    expect(detail).not.toBeNull()
    expect(detail!.totalIdr).toBe(87500)
    expect(detail!.items.map((i) => i.category)).toEqual(['meals', 'other'])
    expect(detail!.items[0]!.amountIdr).toBe(38500)
    expect(detail!.photos).toHaveLength(1)
    expect(detail!.shareToken).toBe('shr000000001')
    expect(detail!.createdAt).toBeInstanceOf(Date)
  })

  it('reports shareToken: null for an unshared group', async () => {
    queueRows([
      [
        'grp000000001',
        't',
        '2026-08-18',
        null,
        null,
        '2026-08-18T03:00:00.000Z',
        '2026-08-18T03:00:00.000Z',
      ],
    ])
    queueRows([])
    queueRows([])
    queueRows([])
    const detail = await getGroupDetail('u1', 'grp000000001')
    expect(detail!.shareToken).toBeNull()
    expect(detail!.totalIdr).toBe(0)
  })
})

describe('getGroupByShareToken — the one unscoped read', () => {
  const queueEmptyShared = () => {
    queueRows([])
    queueRows([])
    queueRows([])
  }

  it('costs exactly one round trip — three statements in one batch', async () => {
    queueEmptyShared()
    await getGroupByShareToken('tok000000001')
    expect(calls).toHaveLength(3)
  })

  it('filters on the token and on nothing else — no user_id anywhere', async () => {
    queueEmptyShared()
    await getGroupByShareToken('tok000000001')

    expect(flat(0)).toContain('"share_links"."token" = $1')
    for (let i = 0; i < 3; i++) {
      // No user_id PREDICATE and no user id bound. Statement 0 does reference
      // expense_groups.user_id, but only as the join key that resolves ownerName.
      expect(flat(i), `statement ${i}`).not.toMatch(/"user_id" = \$/)
      expect(
        calls[i]!.params.filter((p) => typeof p === 'string'),
        `statement ${i}`,
      ).toEqual(['tok000000001'])
    }
  })

  it('returns null for an unknown or revoked token, with no hint which', async () => {
    queueEmptyShared()
    await expect(getGroupByShareToken('tok000000001')).resolves.toBeNull()
  })

  it('exposes ownerName only — never rawText, userId or email', async () => {
    queueRows([['grp000000001', 'bakar duit tuesday', '2026-08-18', null, 'Miftah']])
    queueRows([['itm000000001', 'roti buaya', '38500', 'meals', 0]])
    queueRows([])

    const shared = await getGroupByShareToken('tok000000001')

    expect(Object.keys(shared!).sort()).toEqual([
      'id',
      'items',
      'note',
      'occurredOn',
      'ownerName',
      'photos',
      'title',
      'totalIdr',
    ])
    expect(shared!.ownerName).toBe('Miftah')
    expect(shared!.totalIdr).toBe(38500)
    expect(flat(0)).not.toContain('"raw_text"')
    expect(flat(0)).not.toContain('"email"')
  })
})

describe('getMonthlyTotals', () => {
  it('brackets exactly `months` months ending at the anchor, inclusive', async () => {
    await getMonthlyTotals('u1', 12, '2026-08')
    expect(calls[0]!.params).toEqual(['u1', '2025-09-01', '2026-09-01'])
  })

  it('groups by a to_char month expression and left-joins so empty groups still count', async () => {
    await getMonthlyTotals('u1', 12, '2026-08')
    const sql = flat()
    expect(sql).toMatch(/to_char\("expense_groups"\."occurred_on", 'YYYY-MM'\)/i)
    expect(sql).toMatch(/left join "expense_items"/i)
    expect(sql).toMatch(/group by/i)
  })

  it('rejects an out-of-range window before touching the database', async () => {
    for (const bad of [0, 61, 1.5, Number.NaN]) {
      await expect(getMonthlyTotals('u1', bad, '2026-08')).rejects.toBeInstanceOf(RangeError)
    }
    expect(calls).toHaveLength(0)
  })

  it('zero-fills the gaps the chart would otherwise skip', async () => {
    queueRows([
      ['2026-08', '266350'],
      ['2026-03', '5000'],
    ])
    const totals = await getMonthlyTotals('u1', 12, '2026-08')

    expect(totals).toHaveLength(12)
    expect(totals[0]!.month).toBe('2025-09')
    expect(totals.at(-1)).toEqual({ month: '2026-08', totalIdr: 266350 })
    expect(totals.find((t) => t.month === '2026-03')!.totalIdr).toBe(5000)
    expect(totals.find((t) => t.month === '2026-07')!.totalIdr).toBe(0)
  })
})

describe('fillZeroMonths', () => {
  it('returns `months` entries, oldest first, all zero for no rows', () => {
    const out = fillZeroMonths([], '2026-08', 12)
    expect(out).toHaveLength(12)
    expect(out[0]!.month).toBe('2025-09')
    expect(out.at(-1)!.month).toBe('2026-08')
    expect(out.every((r) => r.totalIdr === 0)).toBe(true)
  })

  it('lands a row in its own slot and coerces string totals', () => {
    const out = fillZeroMonths(
      [{ month: '2026-03', totalIdr: '5000' as unknown as number }],
      '2026-08',
      12,
    )
    expect(out.find((r) => r.month === '2026-03')).toEqual({ month: '2026-03', totalIdr: 5000 })
  })

  it('ignores months outside the window', () => {
    const out = fillZeroMonths([{ month: '2019-01', totalIdr: 999 }], '2026-08', 3)
    expect(out).toEqual([
      { month: '2026-06', totalIdr: 0 },
      { month: '2026-07', totalIdr: 0 },
      { month: '2026-08', totalIdr: 0 },
    ])
  })

  it('crosses a year boundary correctly', () => {
    expect(fillZeroMonths([], '2026-01', 3).map((r) => r.month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ])
  })
})

describe('getCategoryBreakdown', () => {
  it('scopes to the user, groups by category and orders by the sum descending', async () => {
    await getCategoryBreakdown('u1', '2026-08')
    const sql = flat()

    expect(sql).toContain('"expense_groups"."user_id" = $')
    expect(sql).toMatch(/group by "expense_items"\."category"/i)
    expect(sql).toMatch(/order by sum\("expense_items"\."amount_idr"\) desc/i)
    expect(calls[0]!.params).toEqual(['u1', '2026-08-01', '2026-09-01'])
  })

  it('coerces totals to numbers and unknown categories to `other`', async () => {
    queueRows([
      ['meals', '133350', '4'],
      ['jajan-random', '49000', '1'],
    ])
    const rows = await getCategoryBreakdown('u1', '2026-08')
    expect(rows).toEqual([
      { category: 'meals', totalIdr: 133350, itemCount: 4 },
      { category: 'other', totalIdr: 49000, itemCount: 1 },
    ])
  })
})

describe('getBiggestExpense', () => {
  it('scopes to the user and takes one row with a deterministic tie-break', async () => {
    await getBiggestExpense('u1', '2026-08')
    const sql = flat()

    expect(sql).toContain('"expense_groups"."user_id" = $')
    expect(sql).toMatch(
      /order by "expense_items"\."amount_idr" desc, "expense_groups"\."occurred_on" desc, "expense_items"\."id" asc/i,
    )
    expect(sql).toMatch(/limit (\$\d|1)/i)
  })

  it('returns null for an empty month', async () => {
    queueRows([])
    await expect(getBiggestExpense('u1', '2026-08')).resolves.toBeNull()
  })

  it('returns the item with enough group context to link to /e/[id]', async () => {
    queueRows([
      [
        'itm000000006',
        'fan fries plaza blok m',
        '58850',
        'meals',
        'grp000000001',
        'bakar duit tuesday',
        '2026-08-18',
      ],
    ])
    await expect(getBiggestExpense('u1', '2026-08')).resolves.toEqual({
      itemId: 'itm000000006',
      name: 'fan fries plaza blok m',
      amountIdr: 58850,
      category: 'meals',
      groupId: 'grp000000001',
      groupTitle: 'bakar duit tuesday',
      occurredOn: '2026-08-18',
    })
  })
})

describe('getMonthToDatePair (R-15)', () => {
  it('compares the same day window in both months, in one statement', async () => {
    queueRows([['133350', '90000']])
    const pair = await getMonthToDatePair('u1', '2026-08', 19)

    expect(calls).toHaveLength(1)
    const sql = flat()
    expect(sql).toContain('"expense_groups"."user_id" = $')
    expect(sql.match(/filter \( ?where/gi)).toHaveLength(2)
    expect(sql).toMatch(/inner join "expense_items"/i)
    // Both windows are [day 1 .. throughDay], so February vs January needs no special case.
    expect(calls[0]!.params).toEqual([
      '2026-08-01',
      '2026-08-01',
      19,
      '2026-07-01',
      '2026-07-01',
      19,
      'u1',
      '2026-07-01',
      '2026-09-01',
    ])
    expect(pair).toEqual({ currentIdr: 133350, previousIdr: 90000 })
  })

  it('reports zeros rather than undefined when neither month has spend', async () => {
    queueRows([])
    await expect(getMonthToDatePair('u1', '2026-08', 19)).resolves.toEqual({
      currentIdr: 0,
      previousIdr: 0,
    })
  })

  it('rejects a throughDay outside 1..31 before touching the database', async () => {
    for (const bad of [0, 32, 2.5, Number.NaN]) {
      await expect(getMonthToDatePair('u1', '2026-08', bad)).rejects.toBeInstanceOf(RangeError)
    }
    expect(calls).toHaveLength(0)
  })
})

describe('getPhotoByShareToken — the SECOND unscoped read (F12)', () => {
  it('costs one statement and filters on the token alone', async () => {
    queueRows([])
    await getPhotoByShareToken('tok000000002')

    expect(calls).toHaveLength(1)
    expect(flat()).toContain('"photo_share_links"."token" = $1')
    // No user_id predicate: the token IS the authorisation. Same rule as its sibling above.
    expect(flat()).not.toMatch(/"user_id" = \$/)
    // The trailing 1 is the parameterised `limit 1`, as elsewhere in this file.
    expect(calls[0]!.params).toEqual(['tok000000002', 1])
  })

  it('returns null for an unknown, revoked or deleted photo — no hint which', async () => {
    // Revocation is the photo's deletion cascading the row away, so all three collapse into the
    // same empty result for free. Distinguishing them would confirm a token once existed.
    queueRows([])
    await expect(getPhotoByShareToken('tok000000002')).resolves.toBeNull()
  })

  it('SELECTS THREE COLUMNS AND NO MORE — this is the privacy boundary', async () => {
    /*
     * The most load-bearing assertion in this file after the user_id ones. Whatever this
     * projection carries is served to anyone holding the URL, with no second gate behind it. A
     * field added to the select is a field published to the open internet, and the failure would
     * be invisible: the page would render exactly as before, just with more in the payload.
     */
    queueRows([['https://x.public.blob.vercel-storage.com/photos/a-b.jpg', 1200, 1600]])
    const shared = await getPhotoByShareToken('tok000000002')

    expect(Object.keys(shared!).sort()).toEqual(['blobUrl', 'height', 'width'])

    const sql = flat()
    // The expense the photo belongs to must be unreachable from here.
    for (const forbidden of ['"title"', '"occurred_on"', '"note"', '"raw_text"', '"amount_idr"']) {
      expect(sql, forbidden).not.toContain(forbidden)
    }
    // `blob_pathname` is derivable from blob_url, so it is not a secret — but it is also not
    // needed (Lightbox derives the filename from the URL), and an unused column in a public
    // projection is a column someone later builds on.
    expect(sql).not.toContain('"blob_pathname"')
    // No join to `user`: the owner's name is not part of sharing one photo.
    expect(sql).not.toContain('"user"')
  })
})

describe('getItemsForWindow (F12) — the insight input', () => {
  it('scopes to the user and brackets the window half-open, inclusive of today', async () => {
    queueRows([])
    await getItemsForWindow('u1', '2026-06-21', '2026-08-21')

    expect(calls).toHaveLength(1)
    expect(flat()).toContain('"expense_groups"."user_id" = $')
    // The upper bound is TODAY + 1 DAY: an expense entered this morning has to reach this
    // morning's summary, and a half-open range on `occurred_on` would otherwise exclude it.
    expect(calls[0]!.params).toEqual(['u1', '2026-06-21', '2026-08-22', 1500])
  })

  it('is an INNER join, so a group with no items contributes no phantom row', async () => {
    queueRows([])
    await getItemsForWindow('u1', '2026-06-21', '2026-08-21')
    expect(flat()).toContain('inner join')
    expect(flat()).not.toContain('left join')
  })

  it('carries a row cap — a bounded prompt is a bounded bill', async () => {
    queueRows([])
    await getItemsForWindow('u1', '2026-06-21', '2026-08-21', 10)
    expect(calls[0]!.params.at(-1)).toBe(10)
  })

  it('sends merchant NAMES, which is what makes the summaries specific', async () => {
    // Decision D-F. Without expense_items.name the model can only talk about categories, and
    // none of the card's examples (cordoba, trikayo, bensin motor) are answerable.
    queueRows([['2026-08-18', 'Nasi Cordoba', '25000', 'meals']])
    const rows = await getItemsForWindow('u1', '2026-06-21', '2026-08-21')
    expect(rows).toEqual([
      { occurredOn: '2026-08-18', name: 'Nasi Cordoba', amountIdr: 25000, category: 'meals' },
    ])
  })

  it('orders oldest-first, so the model reads the window as a timeline', async () => {
    queueRows([])
    await getItemsForWindow('u1', '2026-06-21', '2026-08-21')
    expect(flat()).toMatch(/order by .*"occurred_on"/)
    expect(flat()).not.toContain('desc')
  })
})

describe('getInsightWatermark (F12)', () => {
  it('is ONE statement scoped to the user, returning both components', async () => {
    queueRows([['2026-08-21T10:00:00.000Z', 12]])
    const w = await getInsightWatermark('u1')

    expect(calls).toHaveLength(1)
    expect(flat()).toContain('"user_id" = $1')
    expect(flat()).toContain('max(')
    // The count is not decoration: deleting a group BELOW the max leaves the max untouched, so
    // max alone would report a summary fresh that still quotes a deleted expense.
    expect(flat()).toContain('count(*)')
    expect(w.groupCount).toBe(12)
  })

  it('coerces the driver’s string timestamp into a Date', async () => {
    // The Neon HTTP driver hands back a string for an aggregated timestamptz, not a Date. Left
    // as a string, `insightDataKey` would call `.getTime()` on it and throw.
    queueRows([['2026-08-21T10:00:00.000Z', 3]])
    const w = await getInsightWatermark('u1')
    expect(w.maxUpdatedAt).toBeInstanceOf(Date)
    expect(w.maxUpdatedAt?.toISOString()).toBe('2026-08-21T10:00:00.000Z')
  })

  it('reports a brand-new account as (null, 0) rather than throwing', async () => {
    queueRows([[null, 0]])
    expect(await getInsightWatermark('u1')).toEqual({ maxUpdatedAt: null, groupCount: 0 })
  })
})
