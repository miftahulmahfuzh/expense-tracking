'use server'

import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { requireUserId } from '@/lib/auth/requireUserId'
import { CATEGORIES } from '@/lib/categories'
import { db } from '@/lib/db'
import { getOwnedGroupAnchor, getOwnedItemAnchor } from '@/lib/db/queries'
import { expenseItems } from '@/lib/db/schema'
import { newItemId } from '@/lib/id'

import { revalidateGroup } from './_revalidate'

/**
 * Item Server Actions — roadmap §4.4, F07.
 *
 * Reconciliation R-5 makes each of these its own security boundary: `proxy.ts` does not
 * cover Server Functions, so `requireUserId()` on line 1 and a Zod parse on line 2 are the
 * boundary, not ceremony. Both arguments arrive from the client and neither can be trusted —
 * an item id in particular proves nothing at all, which is why every write here goes through
 * an ownership anchor that joins back to `expense_groups.user_id` (§4.4's "single most
 * important security invariant").
 *
 * ON TRANSACTIONS. The Neon HTTP driver has no interactive transactions (R-4), so
 * anchor-then-write is two statements. That is safe here because BOTH statements are
 * independently scoped to the caller's data: the anchor proves ownership, and the mutation
 * carries `id AND group_id` where the group id is the one just proven. The worst outcome of
 * a race is a no-op write — never a cross-user write.
 */

const NameZ = z.string().trim().min(1).max(120)
/** §4.3's bounds, verbatim. Whole rupiah, no cents (D5). */
const AmountZ = z.number().int().min(0).max(1_000_000_000)
const CategoryZ = z.enum(CATEGORIES)

const AddItemZ = z.object({
  name: NameZ,
  amountIdr: AmountZ,
  category: CategoryZ,
  /**
   * R-16 / CD-1. Optional, and it exists for exactly one reason: "Urungkan" re-inserts a
   * deleted item, and without its original sort order the restored row lands at the bottom
   * of the list — which reads as data loss even though nothing was lost. Omitted ⇒
   * `max(sort_order) + 1`, i.e. unchanged behaviour for any other caller.
   */
  sortOrder: z.number().int().min(0).max(9_999).optional(),
})

const UpdateItemZ = z
  .object({
    name: NameZ.optional(),
    amountIdr: AmountZ.optional(),
    category: CategoryZ.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Tidak ada perubahan' })

const IdZ = z.string().min(1).max(64)

async function nextSortOrder(groupId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${expenseItems.sortOrder}), -1)`.mapWith(Number) })
    .from(expenseItems)
    .where(eq(expenseItems.groupId, groupId))
  return (row?.max ?? -1) + 1
}

/** §4.4 — addItem(groupId, { name, amountIdr, category, sortOrder? }) → { id } */
export async function addItem(groupId: string, input: unknown): Promise<{ id: string }> {
  const userId = await requireUserId()
  const id = IdZ.parse(groupId)
  const data = AddItemZ.parse(input)

  // Ownership BEFORE any write, and it hands back the month this insert changes.
  const anchor = await getOwnedGroupAnchor(userId, id)

  const itemId = newItemId()
  await db.insert(expenseItems).values({
    id: itemId,
    groupId: anchor.groupId,
    name: data.name,
    amountIdr: data.amountIdr,
    category: data.category,
    sortOrder: data.sortOrder ?? (await nextSortOrder(anchor.groupId)),
  })

  revalidateGroup(anchor.groupId, anchor.occurredOn)
  return { id: itemId }
}

/** §4.4 — updateItem(id, { name?, amountIdr?, category? }) → void */
export async function updateItem(id: string, input: unknown): Promise<void> {
  const userId = await requireUserId()
  const itemId = IdZ.parse(id)
  const patch = UpdateItemZ.parse(input)

  const anchor = await getOwnedItemAnchor(userId, itemId)

  // Scoped by BOTH the item id and the group whose ownership was just proven, so even a
  // concurrent re-parent could not make this write escape the user's own data.
  await db
    .update(expenseItems)
    .set(patch)
    .where(and(eq(expenseItems.id, itemId), eq(expenseItems.groupId, anchor.groupId)))

  revalidateGroup(anchor.groupId, anchor.occurredOn)
}

/**
 * §4.4 — deleteItem(id) → void
 *
 * The delete is immediate and the undo re-inserts (plan A7). The alternative — a deferred
 * timer that only commits when the toast expires — loses the write if the tab closes and
 * needs flush-on-unmount plumbing; this is durable, has no races, and costs one extra round
 * trip nobody will notice. The restored row gets a NEW id, which is harmless: nothing in the
 * schema or the UI references an item id across a request.
 */
export async function deleteItem(id: string): Promise<void> {
  const userId = await requireUserId()
  const itemId = IdZ.parse(id)

  const anchor = await getOwnedItemAnchor(userId, itemId)

  await db
    .delete(expenseItems)
    .where(and(eq(expenseItems.id, itemId), eq(expenseItems.groupId, anchor.groupId)))

  revalidateGroup(anchor.groupId, anchor.occurredOn)
}
