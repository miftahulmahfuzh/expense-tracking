/**
 * ════════════════════════════════════════════════════════════════════════════
 *  F03b Task 13 — REGRESSION GUARD ON THE APP'S CORE SECURITY PROPERTY.
 *
 *  Roadmap §4.4 / plan §9: expense_groups is the only table carrying user_id, so
 *  every read and write against expense_items, expense_photos and share_links must
 *  prove ownership with a correlated EXISTS back to it — inside the same statement,
 *  never as a separate SELECT-then-mutate (that is a TOCTOU window).
 *
 *  If one of these tests fails, the failure mode is "any signed-in user can edit
 *  anyone else's expenses". Do not weaken an assertion here to make a refactor pass.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { and, eq } from 'drizzle-orm'

vi.mock('@/lib/db', () => import('./support/probeDb'))

import { db } from '@/lib/db'
import {
  assertGroupOwned,
  getOwnedGroupIdForItem,
  itemOwnedBy,
  NotFoundError,
  photoOwnedBy,
  shareLinkOwnedBy,
} from '@/lib/db/queries'
import { expenseItems, expensePhotos, shareLinks } from '@/lib/db/schema'

import { calls, normalise, queueRows, reset } from './support/probeDb'

beforeEach(reset)
afterEach(reset)

describe('ownership predicates', () => {
  it('itemOwnedBy correlates expense_items back to expense_groups.user_id', () => {
    const { sql, params } = db
      .select()
      .from(expenseItems)
      .where(and(eq(expenseItems.id, 'itm000000000'), itemOwnedBy('u1')))
      .toSQL()

    const flat = normalise(sql)
    expect(flat).toMatch(/exists/i)
    expect(flat).toContain('"expense_groups"."user_id"')
    expect(flat).toContain('"expense_groups"."id" = "expense_items"."group_id"')
    expect(params).toContain('u1')
  })

  it('photoOwnedBy correlates expense_photos back to expense_groups.user_id', () => {
    const { sql, params } = db
      .select()
      .from(expensePhotos)
      .where(and(eq(expensePhotos.id, 'pht000000000'), photoOwnedBy('u1')))
      .toSQL()

    const flat = normalise(sql)
    expect(flat).toMatch(/exists/i)
    expect(flat).toContain('"expense_groups"."user_id"')
    expect(flat).toContain('"expense_groups"."id" = "expense_photos"."group_id"')
    expect(params).toContain('u1')
  })

  it('shareLinkOwnedBy correlates share_links back to expense_groups.user_id', () => {
    const { sql, params } = db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.groupId, 'grp000000000'), shareLinkOwnedBy('u1')))
      .toSQL()

    const flat = normalise(sql)
    expect(flat).toMatch(/exists/i)
    expect(flat).toContain('"expense_groups"."user_id"')
    expect(flat).toContain('"expense_groups"."id" = "share_links"."group_id"')
    expect(params).toContain('u1')
  })

  it('the predicate survives being used in an UPDATE — the §9.2 pattern', () => {
    const { sql, params } = db
      .update(expenseItems)
      .set({ name: 'roti buaya' })
      .where(and(eq(expenseItems.id, 'itm000000000'), itemOwnedBy('u1')))
      .returning({ id: expenseItems.id, groupId: expenseItems.groupId })
      .toSQL()

    const flat = normalise(sql)
    expect(flat).toMatch(/^update "expense_items" set/)
    expect(flat).toMatch(/exists/i)
    expect(flat).toContain('"expense_groups"."user_id"')
    expect(flat).toMatch(/returning/)
    // name, id, userId — the proof is a parameter of the same statement, not a second one.
    expect(params).toEqual(['roti buaya', 'itm000000000', 'u1'])
  })
})

describe('assertGroupOwned', () => {
  it('filters on both id and user_id in one index-only statement', async () => {
    queueRows([[1]])
    await assertGroupOwned('u1', 'grp000000000')

    expect(calls).toHaveLength(1)
    const flat = normalise(calls[0]!.sql)
    expect(flat).toContain('"expense_groups"."id" = $')
    expect(flat).toContain('"expense_groups"."user_id" = $')
    expect(flat).toMatch(/limit (\$\d|1)/i)
    expect(calls[0]!.params.slice(0, 2)).toEqual(['grp000000000', 'u1'])
  })

  it('throws NotFoundError when the group is missing OR belongs to someone else', async () => {
    queueRows([])
    await expect(assertGroupOwned('u2', 'grp000000000')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('NotFoundError carries a machine-readable code and no ownership detail', async () => {
    queueRows([])
    const error = await assertGroupOwned('u2', 'grp000000000').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NotFoundError)
    expect((error as NotFoundError).code).toBe('NOT_FOUND')
    // "not yours" and "does not exist" must be indistinguishable — no oracle.
    expect((error as NotFoundError).message).not.toMatch(/user|owner|permission|forbidden/i)
  })
})

describe('getOwnedGroupIdForItem', () => {
  it('resolves the parent group id while proving ownership', async () => {
    queueRows([['grp000000000']])
    await expect(getOwnedGroupIdForItem('u1', 'itm000000000')).resolves.toBe('grp000000000')

    const flat = normalise(calls[0]!.sql)
    expect(flat).toMatch(/exists/i)
    expect(flat).toContain('"expense_groups"."user_id"')
    expect(calls[0]!.params.slice(0, 2)).toEqual(['itm000000000', 'u1'])
  })

  it('throws NotFoundError for another user’s item', async () => {
    queueRows([])
    await expect(getOwnedGroupIdForItem('u2', 'itm000000000')).rejects.toBeInstanceOf(NotFoundError)
  })
})
