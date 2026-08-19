import 'server-only'

import { del } from '@vercel/blob'

import { blobEnv } from '@/lib/env'

/**
 * Blob deletion — docs/plans/F06-photos.md Task 11.
 *
 * ⚠️ CROSS-FEATURE OBLIGATION (plan CD-4, reconciliation R-18). `expense_photos` rows
 * cascade-delete with their group, but BLOBS DO NOT CASCADE. F07's `deleteExpense(id)`
 * must therefore:
 *
 *     const pathnames = await listOwnedGroupPathnames(userId, id)   // lib/db/photos
 *     // …delete the group (rows cascade)…
 *     await deleteBlobsQuietly(pathnames)
 *
 * Without it, deleting a group leaks every one of its photos into the 1 GB free tier
 * forever, and nothing anywhere reports it. R-18 calls this load-bearing; it is the single
 * fastest way to consume the whole budget.
 */

/** Chunked so one call cannot build an unbounded request body. */
const CHUNK = 100

/**
 * Best-effort blob deletion. NEVER throws.
 *
 * A failed del() leaves an orphan: ~300 KB, invisible to the user, swept later by
 * `npm run blob:sweep`. A THROWN del() aborts a Server Action that has already removed the
 * DB row, so the user is told an operation failed that they can see succeeded — the photo
 * is gone from the gallery and from the share page. Storage leakage is cheap; a lying UI
 * is not. That trade is the whole reason this function exists instead of a bare `del()`.
 *
 * The token is read through `blobEnv()` rather than left to the SDK's implicit
 * `process.env.BLOB_READ_WRITE_TOKEN`: unset, the implicit path fails at request time with
 * a message about a missing store, while blobEnv() fails loudly and says which variable is
 * missing (roadmap §4.8). It is also the one place that failure would otherwise be silent,
 * because this function swallows its own errors.
 */
export async function deleteBlobsQuietly(pathnames: string[]): Promise<void> {
  if (pathnames.length === 0) return

  let token: string
  try {
    token = blobEnv().BLOB_READ_WRITE_TOKEN
  } catch (error) {
    console.error('[blob] cannot delete: blob env is not configured', error)
    return
  }

  for (let i = 0; i < pathnames.length; i += CHUNK) {
    const chunk = pathnames.slice(i, i + CHUNK)
    try {
      // del() is documented as not throwing for a pathname that does not exist, so a
      // re-run — or a sweep racing a delete — is always safe.
      await del(chunk, { token })
    } catch (error) {
      console.error('[blob] delete failed, leaving orphan(s) for the sweeper', {
        pathnames: chunk,
        error,
      })
    }
  }
}
