'use server'

import { revalidatePath } from 'next/cache'
import type { BatchItem } from 'drizzle-orm/batch'
import { z } from 'zod'

import { requireUserId } from '@/lib/auth/requireUserId'
import { db } from '@/lib/db'
import { expenseGroups, expenseItems, expensePhotos } from '@/lib/db/schema'
import { monthKey } from '@/lib/format'
import { newGroupId, newItemId, newPhotoId } from '@/lib/id'
import { MAX_PHOTOS_PER_GROUP, PHOTO_STORED_PATHNAME_RE } from '@/lib/photos/constants'
import { CreateExpenseInput as CreateExpenseInputBase } from '@/lib/schema/expense'

/**
 * Expense Server Actions — roadmap §4.4.
 *
 * OWNERSHIP NOTE. This file is listed under §4.4 with three exports, but only
 * `createExpense` is here. F03's plan §9.4 assigns it to F05 by name ("app/actions/
 * expenses.ts (F05)") and F03b shipped without it, so /new's save path had nothing to call.
 * `updateExpenseMeta` and `deleteExpense` belong to F07 and go in this same file.
 *
 * Reconciliation R-5 makes every action its own security boundary: proxy.ts does not cover
 * Server Functions, so `requireUserId()` on line 1 and a Zod parse on line 2 are the
 * boundary, not ceremony. A Server Action argument is attacker-controlled.
 */

/**
 * F03a publishes `CreateExpenseInput`; it is reused rather than redeclared (R-77) and
 * tightened in exactly two places, both for reasons F03a structurally cannot encode:
 *
 *  - `blobPathname` must match what Vercel actually stores. F03a keeps it a loose
 *    `string().max(500)` because importing F06's constants would give a pure wave-1 module
 *    an edge into wave-3 code; this is the same tightening `attachPhoto` applies, and for
 *    the same reason — only F06 knows what a blob pathname looks like.
 *  - the array is capped at `MAX_PHOTOS_PER_GROUP` (10), not F03a's 20. Ten is the
 *    per-group cap the picker enforces (F06 OQ-3); accepting 20 here would let a crafted
 *    request walk straight past it.
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
    .max(MAX_PHOTOS_PER_GROUP)
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
