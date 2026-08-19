import { cache } from 'react'

import { and, asc, desc, eq, exists, gte, inArray, lt, sql } from 'drizzle-orm'

import { toCategory, type Category } from '@/lib/categories'
import { addMonths, monthRange, type DateISO, type MonthKey } from '@/lib/format'

import { db } from './index'
import { expenseGroups, expenseItems, expensePhotos, shareLinks, users } from './schema'

/* ============================================================================
 * §1 · Errors
 * ==========================================================================*/

/**
 * Thrown when a row does not exist OR is not owned by the caller. The two cases are
 * deliberately indistinguishable — distinguishing them would be an ownership oracle
 * that lets an attacker enumerate other users' ids. Callers map this to a 404.
 */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

/* ============================================================================
 * §2 · Ownership predicates — THE SECURITY PRIMITIVE
 *
 * Every table except expense_groups reaches its owner through group_id. These
 * return a correlated EXISTS(...) SQL fragment that can be dropped into any
 * .where() on the corresponding table. Mutations in F05–F09 MUST use these
 * rather than hand-rolling a join. See docs/plans/F03-data-layer.md §9.
 * ==========================================================================*/

/** EXISTS (SELECT 1 FROM expense_groups WHERE id = expense_items.group_id AND user_id = $userId) */
export function itemOwnedBy(userId: string) {
  return exists(
    db
      .select({ ok: sql`1` })
      .from(expenseGroups)
      .where(and(eq(expenseGroups.id, expenseItems.groupId), eq(expenseGroups.userId, userId))),
  )
}

/** EXISTS (SELECT 1 FROM expense_groups WHERE id = expense_photos.group_id AND user_id = $userId) */
export function photoOwnedBy(userId: string) {
  return exists(
    db
      .select({ ok: sql`1` })
      .from(expenseGroups)
      .where(and(eq(expenseGroups.id, expensePhotos.groupId), eq(expenseGroups.userId, userId))),
  )
}

/** EXISTS (SELECT 1 FROM expense_groups WHERE id = share_links.group_id AND user_id = $userId) */
export function shareLinkOwnedBy(userId: string) {
  return exists(
    db
      .select({ ok: sql`1` })
      .from(expenseGroups)
      .where(and(eq(expenseGroups.id, shareLinks.groupId), eq(expenseGroups.userId, userId))),
  )
}

/**
 * Proves the caller owns a group before a child insert (addItem, attachPhoto,
 * createShareLink). Throws NotFoundError otherwise. One index-only round trip.
 */
export async function assertGroupOwned(userId: string, groupId: string): Promise<void> {
  const rows = await db
    .select({ ok: sql<number>`1`.mapWith(Number) })
    .from(expenseGroups)
    .where(and(eq(expenseGroups.id, groupId), eq(expenseGroups.userId, userId)))
    .limit(1)
  if (rows.length === 0) throw new NotFoundError('Expense group not found')
}

/**
 * Resolve the owning group id of an item, proving ownership on the way.
 * For revalidatePath('/e/<id>') after an item mutation.
 */
export async function getOwnedGroupIdForItem(userId: string, itemId: string): Promise<string> {
  const rows = await db
    .select({ groupId: expenseItems.groupId })
    .from(expenseItems)
    .where(and(eq(expenseItems.id, itemId), itemOwnedBy(userId)))
    .limit(1)
  if (rows.length === 0) throw new NotFoundError('Expense item not found')
  return rows[0]!.groupId
}

/* ============================================================================
 * §3 · Row shapes returned to features
 * ==========================================================================*/

export interface MonthGroupRow {
  id: string
  title: string
  /** 'YYYY-MM-DD' */
  occurredOn: DateISO
  note: string | null
  /** SUM(expense_items.amount_idr), 0 when the group has no items. Never denormalised (roadmap D7). */
  totalIdr: number
  itemCount: number
  photoCount: number
  /**
   * blob_url of the lowest-sort_order photo, or null. R-14: F07's row thumbnail needs it
   * and must not issue a second query for it.
   */
  firstPhotoUrl: string | null
}

export interface ItemRow {
  id: string
  name: string
  amountIdr: number
  category: Category
  sortOrder: number
}

export interface PhotoRow {
  id: string
  blobUrl: string
  blobPathname: string
  width: number | null
  height: number | null
  sizeBytes: number | null
  sortOrder: number
}

export interface GroupDetail {
  id: string
  title: string
  occurredOn: DateISO
  note: string | null
  rawText: string | null
  createdAt: Date
  updatedAt: Date
  items: ItemRow[]
  photos: PhotoRow[]
  /** null when the group is not shared. Presence drives the Bagikan/Cabut toggle on /e/[id] (R-12). */
  shareToken: string | null
  /** Convenience: sum of items[].amountIdr, computed in JS from the rows we already have. */
  totalIdr: number
}

export interface SharedGroup {
  id: string
  title: string
  occurredOn: DateISO
  note: string | null
  /** Owner display name only — never email, never id (roadmap F09). */
  ownerName: string | null
  items: ItemRow[]
  photos: PhotoRow[]
  totalIdr: number
}

export interface MonthlyTotal {
  month: MonthKey
  totalIdr: number
}

export interface CategoryTotal {
  category: Category
  totalIdr: number
  itemCount: number
}

export interface BiggestExpense {
  itemId: string
  name: string
  amountIdr: number
  category: Category
  groupId: string
  groupTitle: string
  occurredOn: DateISO
}

/** R-15 — the two halves of F08's month-over-month delta tile, over the same day window. */
export interface MonthToDatePair {
  currentIdr: number
  previousIdr: number
}

/* ============================================================================
 * §4 · Reads. Every function here except getGroupByShareToken takes userId as
 *      its FIRST parameter and filters on it. No exceptions.
 * ==========================================================================*/

/**
 * All groups in `month` ('YYYY-MM') for `userId`, each with its computed total, item
 * count, photo count and first photo URL.
 *
 * ONE round trip, no N+1: the four aggregates are correlated scalar subqueries in the
 * select list. A LEFT JOIN to both expense_items and expense_photos would fan out the
 * rows (items × photos) and inflate both SUM and COUNT — the classic bug this shape
 * avoids, and the reason tests/db.queries.sql.test.ts asserts the SQL contains no join.
 *
 * Ordering matches /m/[month]: newest day first, then newest-created first within a day.
 */
export async function getMonthGroups(userId: string, month: MonthKey): Promise<MonthGroupRow[]> {
  const { startISO, endExclusiveISO } = monthRange(month)

  /**
   * The four aggregates are built as correlated sub-BUILDERS rather than as raw
   * `sql` fragments, and that is load-bearing rather than a style choice.
   *
   * In a select list with no join, Drizzle renders columns UNQUALIFIED — so the raw
   * fragment `sql\`... where ${expenseItems.groupId} = ${expenseGroups.id}\`` emits
   * `where "group_id" = "id"`, and inside `from "expense_items"` Postgres resolves BOTH
   * names to expense_items (it has an `id` column too). The correlation silently becomes
   * `expense_items.group_id = expense_items.id`, which matches nothing, and every total
   * on /m/[month] reads Rp 0 with no error anywhere. A sub-builder's WHERE is always
   * fully qualified, so the correlation survives. See F03b ruling R-54.
   */
  const itemsOfGroup = eq(expenseItems.groupId, expenseGroups.id)
  const photosOfGroup = eq(expensePhotos.groupId, expenseGroups.id)

  const totalSub = db
    .select({ v: sql`coalesce(sum(${expenseItems.amountIdr}), 0)` })
    .from(expenseItems)
    .where(itemsOfGroup)

  const itemCountSub = db
    .select({ v: sql`count(*)` })
    .from(expenseItems)
    .where(itemsOfGroup)

  const photoCountSub = db
    .select({ v: sql`count(*)` })
    .from(expensePhotos)
    .where(photosOfGroup)

  // R-14. Same round trip; the ORDER BY makes "first" mean what the gallery on
  // /e/[id] also shows first.
  const firstPhotoSub = db
    .select({ v: expensePhotos.blobUrl })
    .from(expensePhotos)
    .where(photosOfGroup)
    .orderBy(asc(expensePhotos.sortOrder), asc(expensePhotos.createdAt))
    .limit(1)

  return db
    .select({
      id: expenseGroups.id,
      title: expenseGroups.title,
      occurredOn: expenseGroups.occurredOn,
      note: expenseGroups.note,
      totalIdr: sql<number>`(${totalSub})`.mapWith(Number),
      itemCount: sql<number>`(${itemCountSub})`.mapWith(Number),
      photoCount: sql<number>`(${photoCountSub})`.mapWith(Number),
      firstPhotoUrl: sql<string | null>`(${firstPhotoSub})`,
    })
    .from(expenseGroups)
    .where(
      and(
        eq(expenseGroups.userId, userId),
        gte(expenseGroups.occurredOn, startISO),
        lt(expenseGroups.occurredOn, endExclusiveISO),
      ),
    )
    .orderBy(desc(expenseGroups.occurredOn), desc(expenseGroups.createdAt))
}

/**
 * Full detail for /e/[id]. Returns null when the group does not exist OR is not owned
 * by userId — indistinguishable on purpose (see NotFoundError).
 *
 * ONE round trip via db.batch: neon-http sends all four statements in a single HTTP
 * request inside a single Postgres transaction, so the four results are mutually
 * consistent. The child queries carry the ownership EXISTS too — defence in depth, and
 * it is the exact pattern F05–F09 must copy.
 */
export async function getGroupDetail(userId: string, id: string): Promise<GroupDetail | null> {
  const [groupRows, itemRows, photoRows, linkRows] = await db.batch([
    db
      .select({
        id: expenseGroups.id,
        title: expenseGroups.title,
        occurredOn: expenseGroups.occurredOn,
        note: expenseGroups.note,
        rawText: expenseGroups.rawText,
        createdAt: expenseGroups.createdAt,
        updatedAt: expenseGroups.updatedAt,
      })
      .from(expenseGroups)
      .where(and(eq(expenseGroups.id, id), eq(expenseGroups.userId, userId)))
      .limit(1),

    db
      .select({
        id: expenseItems.id,
        name: expenseItems.name,
        amountIdr: expenseItems.amountIdr,
        category: expenseItems.category,
        sortOrder: expenseItems.sortOrder,
      })
      .from(expenseItems)
      .where(and(eq(expenseItems.groupId, id), itemOwnedBy(userId)))
      .orderBy(asc(expenseItems.sortOrder), asc(expenseItems.id)),

    db
      .select({
        id: expensePhotos.id,
        blobUrl: expensePhotos.blobUrl,
        blobPathname: expensePhotos.blobPathname,
        width: expensePhotos.width,
        height: expensePhotos.height,
        sizeBytes: expensePhotos.sizeBytes,
        sortOrder: expensePhotos.sortOrder,
      })
      .from(expensePhotos)
      .where(and(eq(expensePhotos.groupId, id), photoOwnedBy(userId)))
      .orderBy(asc(expensePhotos.sortOrder), asc(expensePhotos.createdAt)),

    db
      .select({ token: shareLinks.token })
      .from(shareLinks)
      .where(and(eq(shareLinks.groupId, id), shareLinkOwnedBy(userId)))
      .limit(1),
  ])

  const group = groupRows[0]
  if (!group) return null

  const items: ItemRow[] = itemRows.map((r) => ({ ...r, category: toCategory(r.category) }))

  return {
    ...group,
    items,
    photos: photoRows,
    shareToken: linkRows[0]?.token ?? null,
    totalIdr: items.reduce((sum, it) => sum + it.amountIdr, 0),
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  ⚠️  ⚠️  ⚠️   THE ONLY UNSCOPED QUERY IN THE ENTIRE APPLICATION   ⚠️  ⚠️  ⚠️
 *
 *  getGroupByShareToken has NO userId parameter and NO user_id filter, BY DESIGN.
 *  It backs /s/[token], which roadmap §4.6 marks auth-free and proxy.ts must
 *  explicitly NOT protect. The token IS the credential: 12 nanoid symbols = 72 bits.
 *
 *  Rules for anyone touching this function:
 *    1. It returns a SharedGroup, never an ExpenseGroup row — no user_id, no email,
 *       no raw_text, no created_at. Only ownerName, deliberately.
 *    2. Nothing else in the codebase may look a group up by anything other than
 *       (id, userId). If you find yourself wanting a second unscoped read, you are
 *       about to write a vulnerability.
 *    3. Revocation is DELETE FROM share_links, so an unknown OR revoked token must
 *       return null and the page must 404 — never "this link expired", which would
 *       confirm the token once existed.
 *    4. Do not add logging that echoes the token.
 *
 *  R-22: wrapped in React cache(), because /s/[token] calls it from both
 *  generateMetadata and the page body — one request, one round trip. Outside a
 *  React request scope cache() is a pass-through, so tests and scripts are unaffected.
 * ────────────────────────────────────────────────────────────────────────────*/
export const getGroupByShareToken = cache(async (token: string): Promise<SharedGroup | null> => {
  // Subquery resolves token → group_id, so all three statements can go in one batch
  // even though the child queries "depend" on the first.
  const linkedGroupId = db
    .select({ id: shareLinks.groupId })
    .from(shareLinks)
    .where(eq(shareLinks.token, token))

  const [groupRows, itemRows, photoRows] = await db.batch([
    db
      .select({
        id: expenseGroups.id,
        title: expenseGroups.title,
        occurredOn: expenseGroups.occurredOn,
        note: expenseGroups.note,
        ownerName: users.name,
      })
      .from(shareLinks)
      .innerJoin(expenseGroups, eq(expenseGroups.id, shareLinks.groupId))
      .innerJoin(users, eq(users.id, expenseGroups.userId))
      .where(eq(shareLinks.token, token))
      .limit(1),

    db
      .select({
        id: expenseItems.id,
        name: expenseItems.name,
        amountIdr: expenseItems.amountIdr,
        category: expenseItems.category,
        sortOrder: expenseItems.sortOrder,
      })
      .from(expenseItems)
      .where(inArray(expenseItems.groupId, linkedGroupId))
      .orderBy(asc(expenseItems.sortOrder), asc(expenseItems.id)),

    db
      .select({
        id: expensePhotos.id,
        blobUrl: expensePhotos.blobUrl,
        blobPathname: expensePhotos.blobPathname,
        width: expensePhotos.width,
        height: expensePhotos.height,
        sizeBytes: expensePhotos.sizeBytes,
        sortOrder: expensePhotos.sortOrder,
      })
      .from(expensePhotos)
      .where(inArray(expensePhotos.groupId, linkedGroupId))
      .orderBy(asc(expensePhotos.sortOrder), asc(expensePhotos.createdAt)),
  ])

  const group = groupRows[0]
  if (!group) return null

  const items: ItemRow[] = itemRows.map((r) => ({ ...r, category: toCategory(r.category) }))

  return {
    ...group,
    items,
    photos: photoRows,
    totalIdr: items.reduce((sum, it) => sum + it.amountIdr, 0),
  }
})

/**
 * Last `months` months ending at `anchorMonth` inclusive, oldest → newest, with
 * zero-filled gaps so the F08 bar chart has a continuous x-axis.
 *
 * ONE round trip. The zero-fill is done in JS by fillZeroMonths (pure, unit-tested)
 * rather than a SQL generate_series — simpler, driver-agnostic, and testable without a DB.
 *
 * `anchorMonth` is explicit rather than derived from the wall clock (contract delta 8):
 * callers pass currentMonthKey(), which keeps this module deterministic and keeps a
 * midnight boundary from changing an answer mid-render.
 */
export async function getMonthlyTotals(
  userId: string,
  months: number,
  anchorMonth: MonthKey,
): Promise<MonthlyTotal[]> {
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    throw new RangeError(`months must be an integer in 1..60, got ${months}`)
  }
  const firstMonth = addMonths(anchorMonth, -(months - 1))
  const startISO = monthRange(firstMonth).startISO
  const endExclusiveISO = monthRange(anchorMonth).endExclusiveISO

  const monthExpr = sql<string>`to_char(${expenseGroups.occurredOn}, 'YYYY-MM')`

  const rows = await db
    .select({
      month: monthExpr,
      totalIdr: sql<number>`coalesce(sum(${expenseItems.amountIdr}), 0)`.mapWith(Number),
    })
    .from(expenseGroups)
    // LEFT, not INNER: a group with no items must not drop its month out of the series.
    .leftJoin(expenseItems, eq(expenseItems.groupId, expenseGroups.id))
    .where(
      and(
        eq(expenseGroups.userId, userId),
        gte(expenseGroups.occurredOn, startISO),
        lt(expenseGroups.occurredOn, endExclusiveISO),
      ),
    )
    .groupBy(monthExpr)

  return fillZeroMonths(rows, anchorMonth, months)
}

/** Pure. Exported for unit testing and for F08 to reuse on client-side slices. */
export function fillZeroMonths(
  rows: ReadonlyArray<{ month: string; totalIdr: number }>,
  anchorMonth: MonthKey,
  months: number,
): MonthlyTotal[] {
  const byMonth = new Map(rows.map((r) => [r.month, Number(r.totalIdr) || 0]))
  const out: MonthlyTotal[] = []
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(anchorMonth, -i)
    out.push({ month: m, totalIdr: byMonth.get(m) ?? 0 })
  }
  return out
}

/**
 * Per-category totals for one month, biggest first. Powers F08's category **bar list**
 * (R-3 — an 8-slice donut failed the CVD contrast gate, so colour is no longer the only
 * identity channel; the SQL is unchanged).
 * Categories with no spend are simply absent — the list should not draw 0% rows.
 */
export async function getCategoryBreakdown(
  userId: string,
  month: MonthKey,
): Promise<CategoryTotal[]> {
  const { startISO, endExclusiveISO } = monthRange(month)

  const rows = await db
    .select({
      category: expenseItems.category,
      totalIdr: sql<number>`sum(${expenseItems.amountIdr})`.mapWith(Number),
      itemCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(expenseItems)
    .innerJoin(expenseGroups, eq(expenseGroups.id, expenseItems.groupId))
    .where(
      and(
        eq(expenseGroups.userId, userId),
        gte(expenseGroups.occurredOn, startISO),
        lt(expenseGroups.occurredOn, endExclusiveISO),
      ),
    )
    .groupBy(expenseItems.category)
    .orderBy(desc(sql`sum(${expenseItems.amountIdr})`))

  return rows.map((r) => ({ ...r, category: toCategory(r.category) }))
}

/**
 * The single largest ITEM in the month, with enough group context to link to /e/[id].
 * Powers F08's "pengeluaran terbesar" callout. Returns null for an empty month.
 * Ties break on the newest day, then the item id — deterministic, so the callout does
 * not flicker between renders.
 */
export async function getBiggestExpense(
  userId: string,
  month: MonthKey,
): Promise<BiggestExpense | null> {
  const { startISO, endExclusiveISO } = monthRange(month)

  const rows = await db
    .select({
      itemId: expenseItems.id,
      name: expenseItems.name,
      amountIdr: expenseItems.amountIdr,
      category: expenseItems.category,
      groupId: expenseGroups.id,
      groupTitle: expenseGroups.title,
      occurredOn: expenseGroups.occurredOn,
    })
    .from(expenseItems)
    .innerJoin(expenseGroups, eq(expenseGroups.id, expenseItems.groupId))
    .where(
      and(
        eq(expenseGroups.userId, userId),
        gte(expenseGroups.occurredOn, startISO),
        lt(expenseGroups.occurredOn, endExclusiveISO),
      ),
    )
    .orderBy(desc(expenseItems.amountIdr), desc(expenseGroups.occurredOn), asc(expenseItems.id))
    .limit(1)

  const row = rows[0]
  return row ? { ...row, category: toCategory(row.category) } : null
}

/**
 * R-15 — spend in `month` days 1..throughDay against the SAME window of the previous
 * month, for F08's delta tile.
 *
 * Comparing a 19-day August against a complete 31-day July reports a fake collapse every
 * day before the month ends, which is exactly when the user opens /stats. Both windows
 * are `[day 1 .. throughDay]` of their own month, so February-vs-January needs no
 * day-count special case.
 *
 * One statement, two FILTERed sums. The WHERE brackets both months so the
 * (user_id, occurred_on DESC) index still drives the scan.
 */
export async function getMonthToDatePair(
  userId: string,
  month: MonthKey,
  throughDay: number,
): Promise<MonthToDatePair> {
  if (!Number.isInteger(throughDay) || throughDay < 1 || throughDay > 31) {
    throw new RangeError(`throughDay must be an integer in 1..31, got ${throughDay}`)
  }
  const currentStartISO = monthRange(month).startISO
  const previousStartISO = monthRange(addMonths(month, -1)).startISO
  const endExclusiveISO = monthRange(month).endExclusiveISO

  const windowSum = (startISO: DateISO) =>
    sql<number>`coalesce(sum(${expenseItems.amountIdr}) filter (
      where ${expenseGroups.occurredOn} >= ${startISO}::date
        and ${expenseGroups.occurredOn} < ${startISO}::date + ${throughDay}::int
    ), 0)`.mapWith(Number)

  const rows = await db
    .select({
      currentIdr: windowSum(currentStartISO),
      previousIdr: windowSum(previousStartISO),
    })
    .from(expenseGroups)
    .innerJoin(expenseItems, eq(expenseItems.groupId, expenseGroups.id))
    .where(
      and(
        eq(expenseGroups.userId, userId),
        gte(expenseGroups.occurredOn, previousStartISO),
        lt(expenseGroups.occurredOn, endExclusiveISO),
      ),
    )

  // An aggregate with no GROUP BY always yields one row, but a driver that returned none
  // must not surface as NaN in the delta tile.
  return { currentIdr: rows[0]?.currentIdr ?? 0, previousIdr: rows[0]?.previousIdr ?? 0 }
}
