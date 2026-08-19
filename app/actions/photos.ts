'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUserId } from '@/lib/auth/requireUserId'
import { deleteBlobsQuietly } from '@/lib/blob/delete'
import { deleteOwnedPhoto, pathnamesInUse, upsertPhotoForUser } from '@/lib/db/photos'
import { PHOTO_STORED_PATHNAME_RE } from '@/lib/photos/constants'
import { AttachPhotoInput as AttachPhotoInputBase } from '@/lib/schema/expense'

/**
 * Photo Server Actions — roadmap §4.4, docs/plans/F06-photos.md Task 13.
 *
 * Every action here is its own security boundary. Reconciliation R-5 established that
 * proxy.ts does not cover Server Functions, so `requireUserId()` on line 1 and a Zod parse
 * on line 2 are not ceremony — a Server Action argument is attacker-controlled.
 */

/**
 * F03a already publishes `AttachPhotoInput` (lib/schema/expense.ts). Reused rather than
 * redeclared — the plan sketched a second copy with a subtly different id rule — and
 * tightened in one place: `blobPathname` must match the shape Vercel actually stores.
 * F03a keeps it as a loose `string().max(500)` because it cannot import F06's constants
 * without giving wave-1 code an edge into wave-3 code; this is the right place for the
 * regex, since only F06 knows what a blob pathname looks like.
 *
 * `.nullish()` on the three dimensions rather than F03a's `.optional()`: the values arrive
 * from a client component where "not measured" is naturally `null`, and both mean the same
 * thing to upsertPhotoForUser.
 */
const AttachPhotoInput = AttachPhotoInputBase.extend({
  blobPathname: z.string().regex(PHOTO_STORED_PATHNAME_RE, 'invalid blob pathname'),
  width: z.number().int().positive().max(20_000).nullish(),
  height: z.number().int().positive().max(20_000).nullish(),
  sizeBytes: z.number().int().positive().max(50_000_000).nullish(),
})
export type AttachPhotoInput = z.infer<typeof AttachPhotoInput>

/**
 * §4.4 — attachPhoto({ groupId, blobUrl, blobPathname, width, height, sizeBytes }) → { id }
 *
 * Idempotent on (groupId, blobPathname): calling it twice for the same blob returns the
 * same id and creates exactly one row (CD-3 / R-20). That is load-bearing rather than
 * defensive — onUploadCompleted never fires against localhost, so the client path must be
 * safe to run twice in production where both writers exist.
 */
export async function attachPhoto(raw: AttachPhotoInput): Promise<{ id: string }> {
  const userId = await requireUserId()
  const input = AttachPhotoInput.parse(raw)

  const { id } = await upsertPhotoForUser({ userId, ...input })

  revalidatePath(`/e/${input.groupId}`)
  return { id }
}

/**
 * §4.4 — deletePhoto(id) → void. Removes the row, then the bytes.
 *
 * ORDER MATTERS AND IT IS ROW FIRST (§10). If the del() fails, the row is gone and ~300 KB
 * leaks until the sweeper runs — invisible, bounded, and the user-visible outcome is
 * exactly right: the photo has disappeared from the gallery and from /s/[token]. Reversed,
 * a failed row delete leaves a row pointing at a 404, which renders a broken tile on a
 * public page the user has already sent to a friend.
 */
export async function deletePhoto(id: string): Promise<void> {
  const userId = await requireUserId()
  const photoId = z.string().min(1).max(64).parse(id)

  // One statement, ownership inside it. Null means "no such photo" or "not yours" —
  // never distinguish them, or this becomes an ownership oracle.
  const deleted = await deleteOwnedPhoto(userId, photoId)
  if (!deleted) {
    throw new Error('Foto tidak ditemukan')
  }

  // Best effort, never throws: see lib/blob/delete.ts.
  await deleteBlobsQuietly([deleted.blobPathname])

  revalidatePath(`/e/${deleted.groupId}`)
}

const Pathnames = z.array(z.string().regex(PHOTO_STORED_PATHNAME_RE)).max(50)

/**
 * NOT in §4.4 — additive export, accepted as CD-2 / R-19.
 *
 * Deletes STAGED blobs: bytes in the store with no expense_photos row. Used when the user
 * taps ✕ on a tile on /new, discards a draft, or F05 drops a draft older than
 * ORPHAN_GRACE_MS on mount (§11.1).
 *
 * SECURITY. This cannot be scoped by userId, because an unreferenced blob has no row to
 * join through — that is what "staged" means. It is scoped by unreferenced-ness instead:
 * anything a row points at, anyone's row, is refused. So the only reachable blobs are
 * someone's in-flight draft, and a pathname is ~125 bits plus Vercel's 30-character
 * suffix, which is not guessable. A signed-in session is still required, so this is not an
 * anonymous delete endpoint.
 */
export async function discardStagedPhotos(pathnames: string[]): Promise<void> {
  await requireUserId()
  const parsed = Pathnames.parse(pathnames)
  if (parsed.length === 0) return

  const inUse = await pathnamesInUse(parsed)
  const safe = parsed.filter((p) => !inUse.has(p))
  if (safe.length !== parsed.length) {
    console.warn('[photos] refused to discard referenced pathnames', {
      requested: parsed.length,
      skipped: parsed.length - safe.length,
    })
  }

  await deleteBlobsQuietly(safe)
}
