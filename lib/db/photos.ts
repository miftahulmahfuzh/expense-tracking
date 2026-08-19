import 'server-only'

import { and, eq, inArray, sql } from 'drizzle-orm'

import { newPhotoId } from '@/lib/id'

import { db } from './index'
import { assertGroupOwned, NotFoundError, photoOwnedBy } from './queries'
import { expensePhotos } from './schema'

/**
 * Photo MUTATION helpers — docs/plans/F06-photos.md Task 10.
 *
 * F03 owns reads (lib/db/queries.ts ships no mutations, by its own boundary rule), so the
 * writes photos need live here. What does NOT live here is a second copy of the security
 * primitives: `assertGroupOwned`, `photoOwnedBy` and `NotFoundError` are imported from
 * queries.ts. The plan sketched local versions with hand-rolled joins; duplicating the
 * app's core ownership check is exactly what reconciliation R-7, R-8 and R-33 each struck
 * down, and two copies means the day one is hardened the other is not.
 *
 * THE INVARIANT (roadmap §4.4): expense_photos has no user_id of its own — it reaches its
 * owner through group_id. Every function here therefore either calls assertGroupOwned
 * first or carries `photoOwnedBy(userId)` inside the statement. There is no third option.
 */

export type UpsertPhotoInput = {
  userId: string
  groupId: string
  blobUrl: string
  blobPathname: string
  width?: number | null
  height?: number | null
  sizeBytes?: number | null
}

/**
 * Idempotent on (group_id, blob_pathname) — reconciliation R-20 / plan CD-3.
 *
 * Two writers race here by design (decision D-B): the browser calls attachPhoto() as soon
 * as upload() resolves, and — in production only — Vercel's onUploadCompleted webhook
 * calls this too. Whichever lands first inserts. The second backfills width/height/
 * size_bytes when the stored row has NULLs, because the webhook never sees the image; §4.2
 * declares those three columns nullable precisely so the webhook path is legal.
 *
 * Why an application-level check-then-insert rather than ON CONFLICT: there is no unique
 * index on (group_id, blob_pathname) in the shipped schema, and adding one is F03's call,
 * not a side effect of F06. The race window is not a correctness problem here — a
 * duplicated row would need both writers inside the same few milliseconds, and the worst
 * outcome is one extra gallery tile pointing at the same blob, which deletePhoto can
 * remove. Worth revisiting if the webhook ever becomes the primary writer.
 */
export async function upsertPhotoForUser(
  input: UpsertPhotoInput,
): Promise<{ id: string; created: boolean }> {
  // Ownership FIRST: everything below writes.
  await assertGroupOwned(input.userId, input.groupId)

  const [existing] = await db
    .select({
      id: expensePhotos.id,
      width: expensePhotos.width,
      height: expensePhotos.height,
      sizeBytes: expensePhotos.sizeBytes,
    })
    .from(expensePhotos)
    .where(
      and(
        eq(expensePhotos.groupId, input.groupId),
        eq(expensePhotos.blobPathname, input.blobPathname),
      ),
    )
    .limit(1)

  if (existing) {
    const patch: Partial<{ width: number; height: number; sizeBytes: number }> = {}
    if (existing.width == null && input.width != null) patch.width = input.width
    if (existing.height == null && input.height != null) patch.height = input.height
    if (existing.sizeBytes == null && input.sizeBytes != null) patch.sizeBytes = input.sizeBytes
    if (Object.keys(patch).length > 0) {
      await db.update(expensePhotos).set(patch).where(eq(expensePhotos.id, existing.id))
    }
    return { id: existing.id, created: false }
  }

  // Append at the end of the group. MAX+1 rather than COUNT: a deleted photo leaves a gap
  // in sort_order, and COUNT would then reuse an index that is already taken.
  const [next] = await db
    .select({ v: sql<number>`coalesce(max(${expensePhotos.sortOrder}), -1) + 1`.mapWith(Number) })
    .from(expensePhotos)
    .where(eq(expensePhotos.groupId, input.groupId))

  const id = newPhotoId()
  await db.insert(expensePhotos).values({
    id,
    groupId: input.groupId,
    blobUrl: input.blobUrl,
    blobPathname: input.blobPathname,
    width: input.width ?? null,
    height: input.height ?? null,
    sizeBytes: input.sizeBytes ?? null,
    sortOrder: next?.v ?? 0,
  })

  return { id, created: true }
}

/**
 * Delete one owned photo row and report the blob that is now unreferenced.
 *
 * DEVIATION from the plan, which sketched `findOwnedPhoto()` followed by a separate
 * `db.delete(...).where(eq(id))`. That is two round trips with an ownership check that has
 * already gone stale by the time the delete runs, and the second statement is scoped by id
 * alone — the shape R-5 and F03 §9 both forbid. One DELETE carrying `photoOwnedBy` and a
 * RETURNING clause is strictly better: no TOCTOU window, no unscoped mutation, one trip,
 * and the pathname the caller must del() comes back with it.
 *
 * Returns null when the row does not exist OR is not this user's — deliberately the same
 * answer either way, so the action cannot be used as an ownership oracle.
 */
export async function deleteOwnedPhoto(
  userId: string,
  photoId: string,
): Promise<{ id: string; groupId: string; blobPathname: string } | null> {
  const [row] = await db
    .delete(expensePhotos)
    .where(and(eq(expensePhotos.id, photoId), photoOwnedBy(userId)))
    .returning({
      id: expensePhotos.id,
      groupId: expensePhotos.groupId,
      blobPathname: expensePhotos.blobPathname,
    })
  return row ?? null
}

/**
 * Every blob pathname in a group the user owns. This is what makes F07's deleteExpense
 * able to honour CD-4 / R-18: the FK cascade removes the rows and orphans the bytes
 * forever, so the pathnames must be collected BEFORE the group goes.
 */
export async function listOwnedGroupPathnames(userId: string, groupId: string): Promise<string[]> {
  const rows = await db
    .select({ pathname: expensePhotos.blobPathname })
    .from(expensePhotos)
    .where(and(eq(expensePhotos.groupId, groupId), photoOwnedBy(userId)))
  return rows.map((r) => r.pathname)
}

/**
 * Which of these pathnames are referenced by ANY row, of any user.
 *
 * This is the guard on discardStagedPhotos (CD-2). That action deletes bytes for blobs
 * with no row yet, so it cannot be scoped by userId — there is nothing to join through.
 * Instead it is scoped by *unreferenced-ness*: anything a row points at is refused, so the
 * only blobs reachable are someone's in-flight draft, and a pathname carries ~125 bits
 * plus Vercel's 30-character suffix, so guessing one is not a threat model.
 */
export async function pathnamesInUse(pathnames: string[]): Promise<Set<string>> {
  if (pathnames.length === 0) return new Set()
  const rows = await db
    .select({ pathname: expensePhotos.blobPathname })
    .from(expensePhotos)
    .where(inArray(expensePhotos.blobPathname, pathnames))
  return new Set(rows.map((r) => r.pathname))
}

/** Re-exported so a caller that only touches photos has one import, not two. */
export { NotFoundError }
