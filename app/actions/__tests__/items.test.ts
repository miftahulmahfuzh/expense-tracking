/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F07 — addItem / updateItem / deleteItem.
 *
 *  These three are the app's most dangerous actions, because an item id is the only
 *  thing they are given and an item id proves NOTHING: expense_items carries no
 *  user_id. Every one of them therefore has to reach back to expense_groups.user_id
 *  before it writes, and write with that proof in the WHERE clause. Roadmap §4.4 calls
 *  this "the single most important security invariant in the app"; R-5 makes each
 *  action, not proxy.ts, the boundary that enforces it.
 *
 *  Five properties, each a silent failure if it regresses:
 *
 *   1. requireUserId() runs FIRST — before validation, before any statement.
 *   2. Ownership is proven BEFORE the write, and the write is scoped by the proof.
 *   3. A cross-user id is indistinguishable from a missing one, and writes nothing.
 *   4. sort_order round-trips (R-16), because that is what makes "Urungkan" put a row
 *      back where it was rather than at the bottom.
 *   5. Both the group's month and /e/<id> are revalidated, or the month list keeps
 *      showing a total that is no longer true.
 *
 *  `@/auth` is mocked so F02's real requireUserId runs; `@/lib/db` is the probe client
 *  so F03's real ownership SQL runs and the emitted statements are observable.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/auth', () => ({ auth: authMock }))

vi.mock('@/lib/db', () => import('../../../tests/support/probeDb'))

const revalidatePath = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidatePath }))

/** redirect() throws NEXT_REDIRECT; a bare throw is enough to observe the bounce. */
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

const { addItem, deleteItem, updateItem } = await import('../items')
const { NotFoundError } = await import('@/lib/db/queries')
const { calls, normalise, queueRows, reset } = await import('../../../tests/support/probeDb')

const USER = 'usr000000001'
const GROUP = 'grp000000001'
const ITEM = 'itm000000001'
const DAY = '2026-08-18'

/** What getOwnedGroupAnchor / getOwnedItemAnchor select, in key order. */
const anchorRow = [[GROUP, DAY]]

const newItem = { name: 'roti buaya', amountIdr: 38_500, category: 'food' as const }

beforeEach(() => {
  vi.clearAllMocks()
  reset()
  authMock.mockResolvedValue({ user: { id: USER } })
})

/**
 * F12 §6.1 — each of these actions now runs ONE MORE STATEMENT than it used to: an
 * `update expense_groups set updated_at` on the parent row. It exists because the LLM summaries
 * on /stats key their freshness on `max(expense_groups.updated_at)`, and before it that key was
 * a lie for every mutation in this file — correcting an amount writes to `expense_items` only,
 * so a stale summary would have reported itself fresh.
 *
 * The statement counts below are asserted rather than loosened, and that is deliberate: the
 * count is how this suite catches an accidental N+1, so "one more, and here is which one" is the
 * assertion worth having.
 */
const TOUCH_SQL = /^update "expense_groups" set "updated_at"/

describe('addItem', () => {
  it('proves group ownership before inserting, and scopes the insert to that group', async () => {
    queueRows(anchorRow)

    const { id } = await addItem(GROUP, { ...newItem, sortOrder: 3 })

    expect(id).toMatch(/^[0-9A-Za-z_-]{12}$/)
    expect(calls).toHaveLength(3) // anchor, insert, touch (F12 §6.1)

    const [anchor, insert, touch] = calls
    expect(normalise(touch!.sql)).toMatch(TOUCH_SQL)
    expect(touch!.params).toContain(GROUP)
    expect(normalise(anchor!.sql)).toMatch(/^select .* from "expense_groups"/)
    expect(anchor!.sql).toContain('"user_id"')
    expect(anchor!.params).toEqual([GROUP, USER, 1])

    expect(normalise(insert!.sql)).toMatch(/^insert into "expense_items"/)
    expect(insert!.params).toContain(GROUP)
    expect(insert!.params).toContain('roti buaya')
    expect(insert!.params).toContain(38_500)
    // R-16: the caller's sort order survives, which is what "Urungkan" depends on.
    expect(insert!.params).toContain(3)
  })

  it('falls back to max(sort_order) + 1 when the caller does not care', async () => {
    queueRows(anchorRow)
    queueRows([[6]]) // coalesce(max(sort_order), -1)

    await addItem(GROUP, newItem)

    expect(calls).toHaveLength(4) // anchor, max(sort_order), insert, touch
    expect(normalise(calls[1]!.sql)).toContain('max("sort_order")')
    expect(calls[2]!.params).toContain(7)
    expect(normalise(calls[3]!.sql)).toMatch(TOUCH_SQL)
  })

  it('redirects before touching the database when there is no session', async () => {
    authMock.mockResolvedValue(null)

    await expect(addItem(GROUP, newItem)).rejects.toThrow('NEXT_REDIRECT:/')
    expect(calls).toHaveLength(0)
  })

  it('validates before the ownership probe, and writes nothing when validation fails', async () => {
    await expect(addItem(GROUP, { ...newItem, category: 'crypto' })).rejects.toThrow()
    await expect(addItem(GROUP, { ...newItem, amountIdr: -1 })).rejects.toThrow()
    await expect(addItem(GROUP, { ...newItem, amountIdr: 1.5 })).rejects.toThrow()
    await expect(addItem(GROUP, { ...newItem, name: '   ' })).rejects.toThrow()
    await expect(addItem(GROUP, { ...newItem, amountIdr: 2_000_000_000 })).rejects.toThrow()

    expect(calls).toHaveLength(0)
  })

  it('writes nothing for a group that is missing OR belongs to someone else', async () => {
    queueRows([]) // the anchor finds nothing

    await expect(addItem(GROUP, newItem)).rejects.toBeInstanceOf(NotFoundError)

    expect(calls).toHaveLength(1)
    expect(calls.some((c) => /insert into/i.test(c.sql))).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('revalidates the detail page, the group month and /stats', async () => {
    queueRows(anchorRow)

    await addItem(GROUP, { ...newItem, sortOrder: 0 })

    expect(revalidatePath).toHaveBeenCalledWith(`/e/${GROUP}`)
    expect(revalidatePath).toHaveBeenCalledWith('/m/2026-08')
    expect(revalidatePath).toHaveBeenCalledWith('/stats')
    expect(revalidatePath).toHaveBeenCalledTimes(3)
  })
})

describe('updateItem', () => {
  it('joins back to expense_groups.user_id, then scopes the update by id AND group', async () => {
    queueRows(anchorRow)

    await updateItem(ITEM, { amountIdr: 45_000 })

    expect(calls).toHaveLength(3) // anchor, update, touch (F12 §6.1)
    expect(normalise(calls[2]!.sql)).toMatch(TOUCH_SQL)

    const [anchor, update] = calls
    const anchorSql = normalise(anchor!.sql)
    expect(anchorSql).toMatch(/^select .* from "expense_items"/)
    // The correlated EXISTS is the ownership proof — not a second query, not a trusted id.
    expect(anchorSql).toMatch(/exists/i)
    expect(anchorSql).toContain('"expense_groups"."user_id"')
    expect(anchor!.params).toContain(USER)

    const updateSql = normalise(update!.sql)
    expect(updateSql).toMatch(/^update "expense_items" set/)
    expect(updateSql).toContain('"id" = $')
    expect(updateSql).toContain('"group_id" = $')
    expect(update!.params).toEqual([45_000, ITEM, GROUP])
  })

  it('sends only the fields that changed', async () => {
    queueRows(anchorRow)

    await updateItem(ITEM, { category: 'transport' })

    const updateSql = normalise(calls[1]!.sql)
    expect(updateSql).toContain('"category"')
    expect(updateSql).not.toContain('"name"')
    expect(updateSql).not.toContain('"amount_idr"')
  })

  it('refuses an empty patch rather than emitting UPDATE … SET nothing', async () => {
    await expect(updateItem(ITEM, {})).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('refuses an unknown category, so the 8 in §4.1 stay the only 8', async () => {
    await expect(updateItem(ITEM, { category: 'kopi' })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('writes nothing for another users item', async () => {
    queueRows([])

    await expect(updateItem(ITEM, { name: 'x' })).rejects.toBeInstanceOf(NotFoundError)

    expect(calls).toHaveLength(1)
    expect(calls.some((c) => /^update/i.test(normalise(c.sql)))).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('deleteItem', () => {
  it('proves ownership, then deletes scoped by id AND group', async () => {
    queueRows(anchorRow)

    await deleteItem(ITEM)

    expect(calls).toHaveLength(3) // anchor, delete, touch (F12 §6.1)
    expect(normalise(calls[2]!.sql)).toMatch(TOUCH_SQL)
    const deleteSql = normalise(calls[1]!.sql)
    expect(deleteSql).toMatch(/^delete from "expense_items"/)
    expect(deleteSql).toContain('"id" = $')
    expect(deleteSql).toContain('"group_id" = $')
    expect(calls[1]!.params).toEqual([ITEM, GROUP])

    expect(revalidatePath).toHaveBeenCalledWith('/m/2026-08')
  })

  it('deletes nothing for another users item', async () => {
    queueRows([])

    await expect(deleteItem(ITEM)).rejects.toBeInstanceOf(NotFoundError)

    expect(calls).toHaveLength(1)
    expect(calls.some((c) => /^delete/i.test(normalise(c.sql)))).toBe(false)
  })

  it('redirects before touching the database when there is no session', async () => {
    authMock.mockResolvedValue(null)

    await expect(deleteItem(ITEM)).rejects.toThrow('NEXT_REDIRECT:/')
    expect(calls).toHaveLength(0)
  })
})
