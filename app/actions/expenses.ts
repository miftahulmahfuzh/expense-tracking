'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { z } from 'zod'

import { requireUserId } from '@/lib/auth/requireUserId'
import { deleteBlobsQuietly } from '@/lib/blob/delete'
import { db } from '@/lib/db'
import { listOwnedGroupPathnames } from '@/lib/db/photos'
import { getOwnedGroupAnchor } from '@/lib/db/queries'
import { expenseGroups, expenseItems, expensePhotos } from '@/lib/db/schema'
import { isValidDateISO, monthKey } from '@/lib/format'
import { newGroupId, newItemId, newPhotoId } from '@/lib/id'
import { maxPhotosPerGroup } from '@/lib/photos/cap'
import { PHOTO_CAP_CEILING, PHOTO_STORED_PATHNAME_RE } from '@/lib/photos/constants'
import { CreateExpenseInput as CreateExpenseInputBase } from '@/lib/schema/expense'

import { revalidateGroup } from './_revalidate'

/**
 * Expense Server Actions — roadmap §4.4.
 *
 * OWNERSHIP NOTE (R-87). §4.4 lists three exports here. `createExpense` is F05's — F03's
 * plan §9.4 assigns it to F05 by name ("app/actions/expenses.ts (F05)") and F03b shipped
 * without the file, so /new's save path had nothing to call. `updateExpenseMeta` and
 * `deleteExpense`, at the bottom of this file, are F07's.
 *
 * Reconciliation R-5 makes every action its own security boundary: proxy.ts does not cover
 * Server Functions, so `requireUserId()` on line 1 and a Zod parse on line 2 are the
 * boundary, not ceremony. A Server Action argument is attacker-controlled.
 */

/**
 * F03a publishes `CreateExpenseInput`; it is reused rather than redeclared (R-77) and
 * restated in exactly two places, both for reasons F03a structurally cannot encode:
 *
 *  - `blobPathname` must match what Vercel actually stores. F03a keeps it a loose
 *    `string().max(500)` because importing F06's constants would give a pure wave-1 module
 *    an edge into wave-3 code; this is the same tightening `attachPhoto` applies, and for
 *    the same reason — only F06 knows what a blob pathname looks like.
 *  - the array is capped at the per-group cap the picker enforces, which is configuration
 *    (`PHOTO_MAX_PER_GROUP`) and not a constant. The cap is enforced in TWO layers on
 *    purpose:
 *      `.max(PHOTO_CAP_CEILING)` is structural and static — the largest array this action
 *        will ever consider, whatever the env says, so a malformed variable cannot widen it.
 *      `.refine(...)` is the product cap, and reads `maxPhotosPerGroup()` at PARSE time,
 *        i.e. per request. A `.max()` here would freeze the env value into the schema at
 *        module load, which happens to work today (env is fixed per deployment) and would
 *        silently stop working the moment the cap becomes per-user.
 *    The picker enforcing a cap is UX; this is the boundary. A crafted request must not be
 *    able to walk past the picker just because the browser was told a smaller number.
 *
 * What is deliberately NOT checked: whether a `blobPathname` is already referenced by some
 * other group's row. `attachPhoto` does not check it either, and a second, divergent copy
 * of that policy is the R-7 / R-8 / R-77 failure mode — the day one copy is hardened the
 * other is not. The pathname is 125 bits plus Vercel's random suffix and arrives from this
 * user's own picker, which is the security argument F06 already made and had accepted.
 */
const CreateExpenseInput = CreateExpenseInputBase.extend({
  photos: z
    .array(
      z.object({
        blobUrl: z.url().max(1_000),
        blobPathname: z.string().regex(PHOTO_STORED_PATHNAME_RE, 'invalid blob pathname'),
        width: z.number().int().positive().max(20_000),
        height: z.number().int().positive().max(20_000),
        sizeBytes: z.number().int().positive().max(50_000_000),
      }),
    )
    .max(PHOTO_CAP_CEILING)
    .refine((photos) => photos.length <= maxPhotosPerGroup(), {
      error: () => `at most ${maxPhotosPerGroup()} photos per expense`,
    })
    .optional(),
})
export type CreateExpenseInput = z.infer<typeof CreateExpenseInput>

/**
 * §4.4 — createExpense(ParsedExpense & { note?, rawText?, photos? }) → { id }
 *
 * The one write /new makes. Group, items and photo rows go in a single `db.batch`, which
 * `neon-http` sends as one HTTP request inside one Postgres transaction (R-4 —
 * `db.transaction()` throws on this driver). All-or-nothing matters here more than
 * anywhere: a partial commit is an expense whose total is wrong, or a gallery missing the
 * photo the user watched upload.
 *
 * The bytes are already in Blob storage by the time this runs — F06 uploads while the user
 * is still editing the parsed table (R-2 / F06 decision D-C) — so this is one fast round
 * trip on the tap that most needs to feel instant, not a multi-megabyte wait on cellular.
 * That is also why the parameter is `photos` and not the `photoIds` §4.4 originally
 * specified: `expense_photos.group_id` is NOT NULL with an FK, so no photo row and
 * therefore no photo id can exist before its group does.
 *
 * `userId` is set from the session on the insert and never read from `raw`. If a userId
 * ever appears in this signature, that is a bug (F03 §9.1).
 */
export async function createExpense(raw: unknown): Promise<{ id: string }> {
  const userId = await requireUserId()
  const input = CreateExpenseInput.parse(raw)
  const groupId = newGroupId()

  /*
   * Dedupe by pathname. A draft restored from localStorage in two tabs, or a retry after a
   * failed save, can carry the same blob twice; two rows pointing at one blob is a state
   * where deleting one photo silently breaks the other — including on a share page that
   * has already been sent to someone.
   */
  const photos = [...new Map((input.photos ?? []).map((p) => [p.blobPathname, p])).values()]

  /*
   * Built as an array and cast because the photo insert is conditional, and `db.batch`
   * demands a non-empty statically-known tuple. Items are never empty — ParsedExpense caps
   * them at min(1) — so the group insert plus the item insert always give it two.
   */
  const statements: BatchItem<'pg'>[] = [
    db.insert(expenseGroups).values({
      id: groupId,
      userId, // ← ownership, from the session
      title: input.title,
      occurredOn: input.occurred_on,
      note: input.note ?? null,
      rawText: input.rawText ?? null,
    }),
    db.insert(expenseItems).values(
      input.items.map((item, index) => ({
        id: newItemId(),
        groupId,
        name: item.name,
        amountIdr: item.amount_idr,
        category: item.category,
        // Preserves the order the user reviewed, which is the order they pasted.
        sortOrder: index,
      })),
    ),
  ]

  if (photos.length > 0) {
    statements.push(
      db.insert(expensePhotos).values(
        photos.map((photo, index) => ({
          id: newPhotoId(),
          groupId,
          blobUrl: photo.blobUrl,
          blobPathname: photo.blobPathname,
          width: photo.width,
          height: photo.height,
          sizeBytes: photo.sizeBytes,
          sortOrder: index,
        })),
      ),
    )
  }

  await db.batch(statements as unknown as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])

  // The month list is the only cached surface this write invalidates. /e/<id> is brand new,
  // so there is nothing stale to drop, and F05 navigates there immediately.
  revalidatePath(`/m/${monthKey(input.occurred_on)}`)
  return { id: groupId }
}

/* ============================================================================
 * F07 — the editing half of §4.4
 * ==========================================================================*/

const UpdateExpenseMetaZ = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    /**
     * Shape AND calendar validity: `isValidDateISO` rejects 2026-02-30, which a regex
     * cannot. A `date` column would take it and Postgres would throw at the driver, which
     * surfaces as a redacted "an error occurred" in production.
     */
    occurredOn: z.string().refine(isValidDateISO, { message: 'Tanggal tidak valid' }).optional(),
    /** `null` clears the note; `''` is normalised to `null` below so "empty" has one representation. */
    note: z.string().trim().max(2_000).nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Tidak ada perubahan' })

const GroupIdZ = z.string().min(1).max(64)

/**
 * §4.4 — updateExpenseMeta(id, { title?, occurredOn?, note? }) → void
 *
 * Called once per committed edit on /e/[id]: title on blur, note on blur, date on change.
 * A partial patch rather than a whole-object save, so two fields edited in different
 * transitions cannot overwrite each other's value.
 */
export async function updateExpenseMeta(id: string, input: unknown): Promise<void> {
  const userId = await requireUserId()
  const groupId = GroupIdZ.parse(id)
  const patch = UpdateExpenseMetaZ.parse(input)

  /*
   * The anchor is read BEFORE the write, and its `occurredOn` is the month the group is
   * LEAVING. Without it a date edit strands a stale total on the old month forever — the
   * group is gone from that month's rows but the month page still says it is there. There is
   * no code path where the old date is unread, because the ownership check that returns it
   * is mandatory.
   */
  const before = await getOwnedGroupAnchor(userId, groupId)

  await db
    .update(expenseGroups)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.occurredOn !== undefined ? { occurredOn: patch.occurredOn } : {}),
      ...(patch.note !== undefined ? { note: patch.note === '' ? null : patch.note } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(expenseGroups.id, groupId), eq(expenseGroups.userId, userId)))

  // BOTH months. `revalidateGroup` dedupes when the date did not change, so an ordinary
  // title edit still busts exactly one month path.
  revalidateGroup(groupId, before.occurredOn, patch.occurredOn)
}

/**
 * §4.4 — deleteExpense(id) → never (it redirects)
 *
 * TWO THINGS HERE ARE LOAD-BEARING AND EASY TO LOSE.
 *
 * 1. R-18 — the blob sweep. `expense_photos` cascades on the FK, so deleting the group
 *    removes the rows and orphans the bytes in Blob storage FOREVER: nothing left in the
 *    database points at them, so even the sweeper cannot tell them from a live photo by
 *    reference. The pathnames must therefore be collected BEFORE the delete. This is the
 *    fastest way to silently consume the 1 GB free tier.
 * 2. R-17 / CD-2 — the redirect is server-side, and callers must never wrap this in
 *    try/catch. `redirect()` signals by throwing NEXT_REDIRECT; a catch-all swallows it and
 *    strands the user on a page whose data no longer exists. The client alternative
 *    (`await deleteExpense(id)` then `router.replace`) races the revalidation and can paint
 *    the 404 detail page for a frame.
 */
export async function deleteExpense(id: string): Promise<never> {
  const userId = await requireUserId()
  const groupId = GroupIdZ.parse(id)

  const anchor = await getOwnedGroupAnchor(userId, groupId)

  // Ownership-scoped, so this cannot read another user's blob pathnames even with a
  // guessed group id (R-78's rule applied to a read).
  const pathnames = await listOwnedGroupPathnames(userId, anchor.groupId)

  // ON DELETE CASCADE takes items, photos and the share link with it (§4.2).
  await db
    .delete(expenseGroups)
    .where(and(eq(expenseGroups.id, anchor.groupId), eq(expenseGroups.userId, userId)))

  // Row first, then bytes — F06 §10's order, for its reason: a failed `del()` leaks ~300 KB
  // that the sweeper can still find by prefix, while the user-visible outcome is exactly
  // right. `deleteBlobsQuietly` never throws.
  await deleteBlobsQuietly(pathnames)

  revalidateGroup(anchor.groupId, anchor.occurredOn)

  // OUTSIDE any try/catch, and the last statement in the function.
  redirect(`/m/${monthKey(anchor.occurredOn)}`)
}
