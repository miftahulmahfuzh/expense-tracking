/**
 * F03b Task 19 — the read layer against a real Postgres.
 *
 * Run:  TEST_DATABASE_URL="postgres://…" npm run test:int
 *       TZ=America/New_York TEST_DATABASE_URL="postgres://…" npm run test:int   ← proves D-B
 *
 * Point TEST_DATABASE_URL at a **Neon branch**, not at the branch the app uses. The suite
 * creates its own users with random uuids and deletes them in teardown (the cascade doing
 * that cleanly is itself assertion 10), so it is safe to re-run — but it writes rows, and
 * a migration-shaped mistake in a future edit should not land on real data.
 *
 * Without TEST_DATABASE_URL the whole file skips, so CI with no database stays green.
 *
 * What only a real database can prove, and why each is here:
 *   - SUM(bigint) arrives as a JS number, not the string '266350' (plan D-A).
 *   - occurred_on round-trips as 'YYYY-MM-DD' under any process TZ (plan D-B).
 *   - The correlated aggregates in getMonthGroups really correlate (R-54).
 *   - ON DELETE CASCADE and the share_links UNIQUE constraint behave as §4.2 claims.
 *   - getGroupDetail and getGroupByShareToken each cost exactly ONE HTTP round trip.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { and, eq } from 'drizzle-orm'

const TEST_URL = process.env.TEST_DATABASE_URL

type QueriesModule = typeof import('@/lib/db/queries')
type DbModule = typeof import('@/lib/db')

/* ── the canonical example from roadmap §1 ─────────────────────────────────── */

const CANONICAL_ITEMS = [
  { name: 'roti buaya', amountIdr: 38_500, category: 'food' },
  { name: 'ayam sambal hitam', amountIdr: 45_000, category: 'food' },
  // "perumahan laddaland" is deliberately 'other': reconciliation Open question 1 is
  // still open, and a test is not the place to guess an answer the user owes us.
  { name: 'perumahan laddaland', amountIdr: 49_000, category: 'other' },
  { name: 'kungfu soccer', amountIdr: 49_000, category: 'entertainment' },
  { name: 'fan fries plaza blok m', amountIdr: 58_850, category: 'food' },
  { name: 'pak gembus', amountIdr: 26_000, category: 'food' },
] as const

const CANONICAL_TOTAL = 266_350
const FOOD_TOTAL = 38_500 + 45_000 + 58_850 + 26_000

describe.skipIf(!TEST_URL)('lib/db/queries against a real database', () => {
  let q: QueriesModule
  let dbm: DbModule

  const ids = {
    u1: '',
    u2: '',
    gAug: '',
    gAugFirst: '',
    gAugLast: '',
    gJulLast: '',
    gSepFirst: '',
    gJun: '',
    gU2Aug: '',
    firstItem: '',
    token: '',
    photoUrl: '',
  }

  beforeAll(async () => {
    // Route the singleton at the test database before anything imports it.
    process.env.DATABASE_URL = TEST_URL
    delete (globalThis as { __expenseDb?: unknown }).__expenseDb

    dbm = await import('@/lib/db')
    q = await import('@/lib/db/queries')
    const { newId, newShareToken } = await import('@/lib/id')
    const { db, expenseGroups, expenseItems, expensePhotos, shareLinks, users } = dbm

    ids.u1 = crypto.randomUUID()
    ids.u2 = crypto.randomUUID()
    ids.gAug = newId()
    ids.gAugFirst = newId()
    ids.gAugLast = newId()
    ids.gJulLast = newId()
    ids.gSepFirst = newId()
    ids.gJun = newId()
    ids.gU2Aug = newId()
    ids.token = newShareToken()
    ids.photoUrl = `https://blob.example/${ids.gAug}-0.jpg`

    await db.insert(users).values([
      { id: ids.u1, name: 'Satu', email: `${ids.u1}@example.test` },
      { id: ids.u2, name: 'Dua', email: `${ids.u2}@example.test` },
    ])

    await db.insert(expenseGroups).values([
      {
        id: ids.gAug,
        userId: ids.u1,
        title: 'bakar duit tuesday',
        occurredOn: '2026-08-18',
        rawText: 'bakar duit tuesday - 18/8/2026\nroti buaya 38500',
      },
      { id: ids.gAugFirst, userId: ids.u1, title: 'awal bulan', occurredOn: '2026-08-01' },
      { id: ids.gAugLast, userId: ids.u1, title: 'akhir bulan', occurredOn: '2026-08-31' },
      { id: ids.gJulLast, userId: ids.u1, title: 'juli terakhir', occurredOn: '2026-07-31' },
      { id: ids.gSepFirst, userId: ids.u1, title: 'september pertama', occurredOn: '2026-09-01' },
      { id: ids.gJun, userId: ids.u1, title: 'juni', occurredOn: '2026-06-10' },
      { id: ids.gU2Aug, userId: ids.u2, title: 'punya u2', occurredOn: '2026-08-18' },
    ])

    // Insert the canonical items in REVERSE, with sort_order ascending, so that any
    // ordering assertion that passes is testing ORDER BY rather than insertion order.
    const itemRows = [...CANONICAL_ITEMS].map((item, i) => ({
      id: newId(),
      groupId: ids.gAug,
      name: item.name,
      amountIdr: item.amountIdr,
      category: item.category,
      sortOrder: i,
    }))
    ids.firstItem = itemRows[0]!.id
    await db.insert(expenseItems).values([...itemRows].reverse())

    await db.insert(expenseItems).values([
      { id: newId(), groupId: ids.gJun, name: 'kopi', amountIdr: 50_000, category: 'food' },
      { id: newId(), groupId: ids.gU2Aug, name: 'rahasia u2', amountIdr: 12_345, category: 'food' },
    ])

    await db.insert(expensePhotos).values([
      {
        id: newId(),
        groupId: ids.gAug,
        blobUrl: ids.photoUrl,
        blobPathname: `${ids.gAug}-0.jpg`,
        width: 1200,
        height: 1600,
        sizeBytes: 250_000,
        sortOrder: 0,
      },
      {
        id: newId(),
        groupId: ids.gAug,
        blobUrl: `https://blob.example/${ids.gAug}-1.jpg`,
        blobPathname: `${ids.gAug}-1.jpg`,
        sortOrder: 1,
      },
    ])

    await db.insert(shareLinks).values({ token: ids.token, groupId: ids.gAug })
  })

  afterAll(async () => {
    if (!dbm) return
    const { db, users } = dbm
    // Deleting the two users must be enough — assertion 10 depends on it.
    await db.delete(users).where(eq(users.id, ids.u1))
    await db.delete(users).where(eq(users.id, ids.u2))
  })

  /* ── 1 · getMonthGroups ──────────────────────────────────────────────────── */

  it('returns the month’s groups with numeric aggregates, newest day first', async () => {
    const rows = await q.getMonthGroups(ids.u1, '2026-08')

    expect(rows.map((r) => r.occurredOn)).toEqual(['2026-08-31', '2026-08-18', '2026-08-01'])

    const aug = rows.find((r) => r.id === ids.gAug)!
    expect(aug.title).toBe('bakar duit tuesday')
    // The bigint-as-string regression test. If this is '266350', D-A regressed.
    expect(typeof aug.totalIdr).toBe('number')
    expect(aug.totalIdr).toBe(CANONICAL_TOTAL)
    expect(aug.itemCount).toBe(6)
    expect(aug.photoCount).toBe(2)
    expect(aug.firstPhotoUrl).toBe(ids.photoUrl)
  })

  it('reports zeros and a null thumbnail for a group with no items or photos', async () => {
    const rows = await q.getMonthGroups(ids.u1, '2026-08')
    const empty = rows.find((r) => r.id === ids.gAugFirst)!
    expect(empty).toMatchObject({ totalIdr: 0, itemCount: 0, photoCount: 0, firstPhotoUrl: null })
  })

  it('brackets the month half-open — 07-31 and 09-01 are outside 2026-08', async () => {
    const augIds = (await q.getMonthGroups(ids.u1, '2026-08')).map((r) => r.id)
    expect(augIds).toContain(ids.gAugFirst)
    expect(augIds).toContain(ids.gAugLast)
    expect(augIds).not.toContain(ids.gJulLast)
    expect(augIds).not.toContain(ids.gSepFirst)
  })

  it('round-trips occurred_on as a string, with no timezone shift', async () => {
    const rows = await q.getMonthGroups(ids.u1, '2026-08')
    const aug = rows.find((r) => r.id === ids.gAug)!
    expect(aug.occurredOn).toBe('2026-08-18')
    expect(typeof aug.occurredOn).toBe('string')
    // Same result under TZ=America/New_York — that run is what proves plan D-B.
  })

  /* ── 2 · cross-user isolation ────────────────────────────────────────────── */

  it('never leaks another user’s rows', async () => {
    const u2Rows = await q.getMonthGroups(ids.u2, '2026-08')
    expect(u2Rows.map((r) => r.id)).toEqual([ids.gU2Aug])

    await expect(q.getGroupDetail(ids.u2, ids.gAug)).resolves.toBeNull()
    await expect(q.getOwnedGroupIdForItem(ids.u2, ids.firstItem)).rejects.toBeInstanceOf(
      q.NotFoundError,
    )
    await expect(q.assertGroupOwned(ids.u2, ids.gAug)).rejects.toBeInstanceOf(q.NotFoundError)
    await expect(q.assertGroupOwned(ids.u1, ids.gAug)).resolves.toBeUndefined()
  })

  it('refuses a nested UPDATE across users — the §9.2 pattern, proven', async () => {
    const { db, expenseItems } = dbm

    const stolen = await db
      .update(expenseItems)
      .set({ name: 'dicuri u2' })
      .where(and(eq(expenseItems.id, ids.firstItem), q.itemOwnedBy(ids.u2)))
      .returning({ id: expenseItems.id })
    expect(stolen).toHaveLength(0)

    const mine = await db
      .update(expenseItems)
      .set({ name: 'roti buaya' })
      .where(and(eq(expenseItems.id, ids.firstItem), q.itemOwnedBy(ids.u1)))
      .returning({ id: expenseItems.id })
    expect(mine).toHaveLength(1)
  })

  /* ── 3 · getGroupDetail ──────────────────────────────────────────────────── */

  it('assembles the detail in item sort order, with the live share token', async () => {
    const detail = await q.getGroupDetail(ids.u1, ids.gAug)

    expect(detail).not.toBeNull()
    expect(detail!.items.map((i) => i.name)).toEqual(CANONICAL_ITEMS.map((i) => i.name))
    expect(detail!.items.map((i) => i.sortOrder)).toEqual([0, 1, 2, 3, 4, 5])
    expect(detail!.totalIdr).toBe(CANONICAL_TOTAL)
    expect(detail!.photos.map((p) => p.sortOrder)).toEqual([0, 1])
    expect(detail!.photos[1]!.width).toBeNull()
    expect(detail!.shareToken).toBe(ids.token)
    expect(detail!.occurredOn).toBe('2026-08-18')
    expect(detail!.createdAt).toBeInstanceOf(Date)
    expect(detail!.rawText).toContain('bakar duit tuesday')
  })

  it('costs exactly one HTTP round trip', async () => {
    const detailCalls = await countFetches(() => q.getGroupDetail(ids.u1, ids.gAug))
    expect(detailCalls).toBe(1)

    const sharedCalls = await countFetches(() => q.getGroupByShareToken(ids.token))
    expect(sharedCalls).toBe(1)
  })

  /* ── 4 · getGroupByShareToken ────────────────────────────────────────────── */

  it('serves the shared view for a live token and hides the owner’s data', async () => {
    const shared = await q.getGroupByShareToken(ids.token)

    expect(shared).not.toBeNull()
    expect(shared!.title).toBe('bakar duit tuesday')
    expect(shared!.ownerName).toBe('Satu')
    expect(shared!.totalIdr).toBe(CANONICAL_TOTAL)
    expect(shared!.items).toHaveLength(6)
    expect(shared!.photos).toHaveLength(2)
    expect(Object.keys(shared!)).not.toContain('rawText')
    expect(Object.keys(shared!)).not.toContain('userId')
    expect(Object.keys(shared!)).not.toContain('email')
  })

  it('returns null for a garbage token', async () => {
    await expect(q.getGroupByShareToken('nopenopenope')).resolves.toBeNull()
  })

  it('rejects a second share link for the same group (revoke, then re-mint)', async () => {
    const { db, shareLinks } = dbm
    const { newShareToken } = await import('@/lib/id')

    const error = await db
      .insert(shareLinks)
      .values({ token: newShareToken(), groupId: ids.gAug })
      .then(() => null)
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    /**
     * Note for F09 (plan Open question 6, and R-60): Drizzle wraps the driver error, so the
     * outer message is only 'Failed query: insert into "share_links" …'. The Postgres
     * detail — SQLSTATE 23505 and the constraint name — lives on `.cause`. A retry that
     * regexes the outer message will never match.
     */
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause
    expect(cause?.code).toBe('23505') // unique_violation
    expect(cause?.constraint).toBe('share_links_group_id_unq')
  })

  /* ── 5 · aggregates for /stats ───────────────────────────────────────────── */

  it('zero-fills a 12-month window ending at the anchor', async () => {
    const totals = await q.getMonthlyTotals(ids.u1, 12, '2026-08')

    expect(totals).toHaveLength(12)
    expect(totals[0]!.month).toBe('2025-09')
    expect(totals.at(-1)).toEqual({ month: '2026-08', totalIdr: CANONICAL_TOTAL })
    expect(totals.find((t) => t.month === '2026-07')!.totalIdr).toBe(0)
    expect(totals.find((t) => t.month === '2026-06')!.totalIdr).toBe(50_000)
    expect(totals.every((t) => typeof t.totalIdr === 'number')).toBe(true)
  })

  it('breaks the month down per category, biggest first, summing to the month total', async () => {
    const rows = await q.getCategoryBreakdown(ids.u1, '2026-08')

    expect(rows[0]).toEqual({ category: 'food', totalIdr: FOOD_TOTAL, itemCount: 4 })
    expect(rows.reduce((s, r) => s + r.totalIdr, 0)).toBe(CANONICAL_TOTAL)
    const amounts = rows.map((r) => r.totalIdr)
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts)
    // Categories with no spend are absent, not zero rows.
    expect(rows.map((r) => r.category)).not.toContain('health')
  })

  it('finds the biggest single item, and null for an empty month', async () => {
    const biggest = await q.getBiggestExpense(ids.u1, '2026-08')
    expect(biggest).toMatchObject({
      name: 'fan fries plaza blok m',
      amountIdr: 58_850,
      category: 'food',
      groupId: ids.gAug,
      groupTitle: 'bakar duit tuesday',
      occurredOn: '2026-08-18',
    })
    await expect(q.getBiggestExpense(ids.u1, '2026-05')).resolves.toBeNull()
  })

  it('compares the same day window across two months (R-15)', async () => {
    // August days 1..18 hold the whole canonical group; July days 1..18 hold nothing.
    await expect(q.getMonthToDatePair(ids.u1, '2026-08', 18)).resolves.toEqual({
      currentIdr: CANONICAL_TOTAL,
      previousIdr: 0,
    })
    // Day 17 excludes the 18th — the window really is half-open.
    await expect(q.getMonthToDatePair(ids.u1, '2026-08', 17)).resolves.toEqual({
      currentIdr: 0,
      previousIdr: 0,
    })
  })

  /* ── 6 · cascades ────────────────────────────────────────────────────────── */

  it('cascades a group delete to its items, photos and share link', async () => {
    const { db, expenseGroups, expenseItems, expensePhotos, shareLinks } = dbm

    await db.delete(expenseGroups).where(eq(expenseGroups.id, ids.gAug))

    expect(
      await db.select().from(expenseItems).where(eq(expenseItems.groupId, ids.gAug)),
    ).toHaveLength(0)
    expect(
      await db.select().from(expensePhotos).where(eq(expensePhotos.groupId, ids.gAug)),
    ).toHaveLength(0)
    expect(await db.select().from(shareLinks).where(eq(shareLinks.token, ids.token))).toHaveLength(
      0,
    )
    // A revoked (here: cascaded) token is indistinguishable from one that never existed.
    await expect(q.getGroupByShareToken(ids.token)).resolves.toBeNull()
  })

  it('cascades a user delete to their groups', async () => {
    const { db, expenseGroups, users } = dbm

    await db.delete(users).where(eq(users.id, ids.u2))
    expect(
      await db.select().from(expenseGroups).where(eq(expenseGroups.userId, ids.u2)),
    ).toHaveLength(0)
  })
})

/**
 * Counts HTTP requests made while `fn` runs. The neon-http driver issues exactly one
 * fetch per statement, and one per db.batch regardless of how many statements it holds —
 * which is the property this is here to police.
 */
async function countFetches(fn: () => Promise<unknown>): Promise<number> {
  const original = globalThis.fetch
  let count = 0
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    count++
    return original(...args)
  }) as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }
  return count
}
